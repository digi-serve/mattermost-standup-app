// Walk through the standup Questions
import { Cron } from "croner";
import { Client4 } from "@mattermost/client";

import Update, { UPDATE_TYPES } from "./Update";
import kvStore from "../utils/kvStore";
import { label } from "../utils/stateStrings";

// Types
import { Post } from "@mattermost/types/posts";
import { GitHubIntegration } from "./Github";
import { Application } from "express";
import { UserHistory } from "../../@types/kvStore";

interface Option {
   name: string;
   type?: keyof typeof UPDATE_TYPES;
   style?: string;
   url?: string;
   id?: string;
   select?: Record<string, string>[];
}

export enum STATES {
   todo,
   review,
   accomplished,
   goal,
   block,
   personal,
   submit,
}

export default class UpdateBuilder {
   dmID!: string;
   private _githubIntegration!: GitHubIntegration;
   private _state: STATES = 1;
   protected _userClientReady = false;
   private botClient: Client4;
   private botProfilePicURL!: string;
   private botToken!: string;
   private channelID: string;
   private history!: UserHistory;
   private host: string;
   private options!: Option[];
   private port: string;
   private postID!: string;
   private reminderCron!: Cron;
   private siteUrl: string;
   private update = new Update();
   private userClient = new Client4();
   private userID!: string;

   constructor(app: Application) {
      this.botClient = app.locals.botClient;
      this.botToken = this.botClient.getToken();
      this.channelID = app.locals.channel;
      this.host = app.locals.host;
      this.port = app.locals.port;
      this.siteUrl = app.locals.mattermostUrl;
      this.userClient.setUrl(this.siteUrl);
   }

   get userClientReady() {
      return this._userClientReady;
   }

   get hasGithubIntegration() {
      return this._githubIntegration != undefined;
   }

   set githubIntegration(integration: GitHubIntegration) {
      this._githubIntegration = integration;
   }

   private get state() {
      return STATES[this._state];
   }

   private set state(state) {
      this._state = STATES[state];
   }

   async init(userID: string, botID: string) {
      this.userID = userID;
      const dm = await this.botClient.createDirectChannel([botID, userID]);
      this.dmID = dm.id;
      this.botProfilePicURL = await this.botClient.getProfilePictureUrl(
         botID,
         1,
      );
      this.history = await kvStore(
         this.botClient.getToken(),
         this.siteUrl,
      ).getOne("history", userID);
   }

   async initUserClient(token) {
      this.userClient.setToken(token);
      this._userClientReady = true;
   }

   async start() {
      if (this.state != "todo") this.resetNext();
      await this.updateState();
   }

   /**
    * Create or Edit the Update draft post in the User's DM
    * @returns promise
    */
   async postDraft(): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actions: Record<string, any>[] = [];

      await this.generateOptions();

      if (this.state == "review" && this.options.length == 0) {
         this.updateState();
         return;
      }
      this.options.forEach((option, index) => {
         actions.push({
            id: index.toString(),
            name: option.name,
            style: option.style,
            integration: {
               url: option.url ?? `${this.host}:${this.port}/update/form`,
               context: {
                  type: option.type,
                  index: index.toString(),
               },
            },
         });
      });
      const attachments = [
         {
            color: "#939393",
            // title: "Draft Update",
            author_icon: this.botProfilePicURL,
            author_name: "Standup Bot - Draft Update",
            fields: [
               { value: this.update.generate() },
               { value: `--- \n > **_${this.label("question")}_**` },
            ],
            actions,
         },
      ];

      const createdPost = await this.sendDM("", { attachments }, this.postID);
      this.postID = createdPost.id;
      return;
   }

   async publishUpdate() {
      const post = {
         channel_id: this.channelID,
      } as Post;
      const attachments = [
         {
            color: "#008040",
            author_icon: this.botProfilePicURL,
            author_name: "Standup Bot - Update",
            text: this.update.generate(),
         },
      ];
      post.props = { attachments };
      // publish to the main channel
      if (this.userClientReady) {
         try {
            await this.userClient.createPost(post);
         } catch (e) {
            console.log("Error posting as userclient", e);
            console.log("Trying as Bot Client");
            try {
               this.botClient.createPost(post);
            } catch (e) {
               console.log("That failed too", e);
            }
         }
      } else {
         console.log("User Access Token not set, publishing as bot");
         this.botClient.createPost(post);
      }
      // also update the draft dm post
      this.sendDM("Thanks for your Update!", { attachments }, this.postID);
      this.sendDM(
         ":pencil: Reminder: Make sure your task statuses are updated in the GitHub [project](https://github.com/orgs/digi-serve/projects/2)",
      );

      this.history = {
         date: new Date(),
         goals: this.update.goals,
      };
      if (this.userClientReady) {
         kvStore(this.botClient.getToken(), this.siteUrl).addTo(
            "history",
            this.userID,
            this.history,
         );
      }
   }

   // Add an item (submitted from the form) to the update
   processFormAdd(
      submission: { issue: string; note: string; issueOther?: string },
      state: string = "accomplished",
   ): Promise<void> {
      const wasGoal = this.state == "review";
      const type = wasGoal
         ? "accomplished"
         : (state as keyof typeof UPDATE_TYPES);

      this.update.add({
         type,
         reference:
            submission.issue == "none"
               ? submission.issueOther ?? ""
               : submission.issue,
         wasGoal,
         note: submission.note,
      });
      // remove goal as option
      if (wasGoal) {
         const index = parseInt(state);
         this.history.goals.splice(index, 1);
      }
      return this.postDraft();
   }

   // Show a form (interactive dialog) in mattermost to add the selected item.
   showAddForm(
      triggerID: string,
      state: keyof typeof UPDATE_TYPES,
      index: number,
   ) {
      const github = this.state != "personal";
      const isReview = this.state == "review";
      let options: Record<string, string>[] = [];
      let githubOptions = false;
      if (github && !isReview) {
         options = this.githubOptions();
         if (options.length > 0) githubOptions = true;
      }
      const elements: Record<
         string,
         string | boolean | Record<string, string>[]
      >[] = [
         {
            name: "note",
            display_name:
               this.label("note") ??
               state.replace(/^\w/, (x) => x.toUpperCase()),
            type: "text",
            default: isReview ? this.history.goals[index].note : "",
            help_text: this.label("noteHelp"),
         },
      ];
      if (githubOptions) {
         elements.push({
            name: "issue",
            display_name: "GitHub Issue",
            type: "select",
            options: [{ text: "None / Other", value: "none" }, ...options],
            help_text: "If this is related to a GitHub issue select it here.",
         });
      }
      if (github) {
         elements.push({
            name: githubOptions ? "issueOther" : "issue",
            display_name: githubOptions ? "Other GitHub Issue" : "GitHub Issue",
            type: "text",
            optional: true,
            default: isReview ? this.history.goals[index].reference : "",
            help_text: `Add an issue ${
               githubOptions ? " not in the list above " : ""
            }\`{repo_name}#{issue_number}\`. Leave blank if it's not related to any.`,
         });
      }

      const form = {
         trigger_id: triggerID,
         url: `${this.host}:${this.port}/update/add`,
         dialog: {
            title: "Add an Item",
            state: isReview ? index.toString() : state,
            elements,
         },
      };
      this.sendForm(form);
   }

   showEditForm(triggerID: string) {
      const elements: Record<string, string | boolean>[] = [];

      Object.values(UPDATE_TYPES)
         .filter((key) => typeof key == "string")
         .forEach((key) => {
            const element = {
               name: key as string,
               display_name: key as string,
               type: "textarea",
               default: this.update.generate(key as keyof typeof UPDATE_TYPES),
               optional: key != "accomplished" && key != "goal",
            };
            elements.push(element);
         });
      const form = {
         trigger_id: triggerID,
         url: `${this.host}:${this.port}/update/edit/submit`,
         dialog: {
            title: "Edit your update",
            elements,
         },
      };
      this.sendForm(form);
   }

   // Go to the next state
   async updateState() {
      this._state++;
      this.postDraft();
   }

   editUpdate(values) {
      this.update.edit(values);
      this.postDraft();
   }

   // Send a form (interactive dialog) to mattermost
   private sendForm(form): Promise<Response> {
      return fetch(`${this.siteUrl}/api/v4/actions/dialogs/open`, {
         method: "POST",
         body: JSON.stringify(form),
         headers: {
            Authorization: `Bearer ${this.botToken}`,
         },
      });
   }

   // generate this.option based on the state
   private async generateOptions() {
      const next: Option = {
         name: "That's all",
         style: "primary",
         url: `${this.host}:${this.port}/update/next`,
      };
      switch (this.state) {
         case "review":
            if (
               !Array.isArray(this.history?.goals) ||
               this.history.goals.length == 0
            ) {
               this.options = [];
               return;
            }
            this.options = this.history.goals.map((goal) => {
               return { name: goal.note, type: "accomplished" };
            });
            next.name = "Skip";
            this.options.push(next);
            break;
         case "accomplished":
            this.options = [{ name: "Add Work", type: "accomplished" }, next];
            break;
         case "goal":
            this.options = [{ name: "Add Goal", type: "goal" }, next];
            break;
         case "block":
            this.options = [
               { name: "Blocked", type: "block" },
               { name: "Question", type: "question" },
               { name: "Help Wanted", type: "help" },
               next,
            ];
            break;
         case "personal":
            this.options = [
               { name: "Prayer Request", type: "prayer" },
               { name: "Update", type: "personal" },
               next,
            ];
            break;
         case "submit":
            this.options = [
               {
                  name: "Edit",
                  style: "danger",
                  url: `${this.host}:${this.port}/update/edit`,
               },
               {
                  name: "Submit",
                  style: "success",
                  url: `${this.host}:${this.port}/update/submit`,
               },
            ];
      }
   }

   private githubOptions() {
      const since =
         this.state == "accomplished"
            ? this.history?.date ?? new Date() // show closed issue since last update
            : new Date(); // show only open issues
      if (!this._githubIntegration) return [];
      return (
         this._githubIntegration
            .getInprogressIssues(since)
            .map((issue) => {
               const text = issue.reference
                  ? `${issue.reference} ${issue.title}`
                  : issue.title ?? "";
               const value = issue.reference ?? "";
               return { text, value };
            })
            .sort((a, b) => (a.text < b.text ? -1 : 1)) ?? []
      );
   }

   private resetNext() {
      this.update = new Update();
      this.postID = "";
      this.state = "todo";
   }

   setupReminder(
      timezone: string,
      hour: number = 10,
      minute: number = 0,
      excludeDays: string[] = [],
   ) {
      const days = ["MON", "TUE", "WED", "THU", "FRI"].filter(
         (day) => !excludeDays.includes(day),
      );
      if (hour < 0 || hour > 24)
         return new Error(`Hour should be between 0-24, recieced ${hour}`);
      if (minute < 0 || minute > 60)
         return new Error(`Minute should be between 0-60, recieced ${minute}`);
      const cronString = `0 ${minute} ${hour} * * ${days.join(",")}`;
      if (this.reminderCron) this.reminderCron.stop();
      this.reminderCron = Cron(cronString, { timezone }, () => this.reminder());
      return this.reminderHelpText(timezone, days, hour, minute);
   }

   hoursToNextReminder() {
      const ms = this.reminderCron.msToNext();
      if (!ms) return 0;
      else return Math.round(ms / 1000 / 60 / 60);
   }

   private reminder() {
      this.sendDM(
         ":calendar: It's time for your Standup report! **Type `/standup start` to begin.**",
      );
   }

   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   sendDM(message: string, props?: Record<string, any>, id?: string) {
      const post = {
         channel_id: this.dmID,
         message,
      } as Post;
      if (props) post.props = props;
      if (id) {
         post.id = id;
         return this.botClient.updatePost(post);
      } else {
         return this.botClient.createPost(post);
      }
   }

   private reminderHelpText(timezone, days, hour, minute) {
      enum Days {
         MON = "Monday",
         TUE = "Tuesday",
         WED = "Wednesday",
         THU = "Thursday",
         FRI = "Friday",
      }
      days = days.map((day) => Days[day]);
      const lastDay = days.pop();
      const dayString =
         days.length < 1 ? lastDay : `${days.join(", ")}, and ${lastDay}`;
      let isAM = true;
      if (hour > 12) {
         isAM = false;
         hour = hour - 12;
      }
      return `Remiders will be sent at ${hour}:${
         minute > 10 ? minute : `0${minute}`
      } ${
         isAM ? "AM" : "PM"
      } in timezone **${timezone}** on ${dayString} (Next reminder is in about ${this.hoursToNextReminder()} hours)

To change the time run \`/standup settings reminder\`
_Note: Change your timezone in mattermost's setting then run the above command_`;
   }

   private label(key: string) {
      const state = this.state as keyof typeof STATES;
      return label("builder", key, state);
   }
}

// updaters cache
// user_id: updater
const updaters: Record<string, UpdateBuilder> = {};
// helper to get or create updater
export async function getUpdater(
   id: string,
   app: Application,
   actingUserToken?: string,
) {
   if (!updaters[id]) {
      const newUpdater = new UpdateBuilder(app);
      updaters[id] = newUpdater;

      await newUpdater.init(id, app.locals.botID);
   }
   const updater = updaters[id];
   if (actingUserToken /* && !updater.userClientReady */) {
      updater.initUserClient(actingUserToken);
      console.log("Updating actingUserToken");
   }
   if (!updater.hasGithubIntegration && app.locals.githubIntegration) {
      updater.githubIntegration = app.locals.githubIntegration;
   }
   return updater;
}
