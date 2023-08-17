// Walk through the standup Questionss
import { Client4 } from "@mattermost/client";

import Update, { UPDATE_TYPES } from "./Update";
import kvStore from "../utils/kvStore";
import { label } from "../utils/stateStrings";

// Types
import { Post } from "@mattermost/types/posts";
import { GitHubIntegration } from "./Github";
import { Application } from "express";
import { UserHistory } from "../../@types/kvStore";
import { app_id } from "../routes/manifest";
import { AppField, AppForm } from "@mattermost/types/lib/apps";
import BotClient from "./BotClient";

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

export default class UpdateBuilder extends BotClient {
   dmID!: string;
   private _githubIntegration!: GitHubIntegration;
   private _state: STATES = 1;
   private botProfilePicURL!: string;
   private botToken!: string;
   private channelID: string;
   private confirmID!: string;
   private history!: UserHistory;
   private host: string;
   private options!: Option[];
   private port: string;
   private postID!: string;
   private siteUrl: string;
   private update = new Update();
   private userID!: string;

   constructor(app: Application, token: string) {
      const botClient = new Client4();
      botClient.setToken(token);
      botClient.setUrl(app.locals.mattermostUrl);
      super(botClient);
      this.botToken = token;
      this.channelID = app.locals.channel;
      this.host = app.locals.host;
      this.port = app.locals.port;
      this.siteUrl = app.locals.mattermostUrl;
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

   set token(token) {
      this.botClient.setToken(token);
      this.botToken = token;
   }

   override async init(userID: string) {
      await super.init(userID);
      this.userID = userID;
      this.botProfilePicURL = await this.botClient.getProfilePictureUrl(
         this.botClientID,
         1,
      );
      this.history = await kvStore(
         this.botClient.getToken(),
         this.siteUrl,
      ).getOne("history", userID);
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
      const isSubmit = this.state == "submit";

      // Draft Update
      const attachments = [
         {
            color: "#939393",
            author_icon: this.botProfilePicURL,
            author_name: "Standup Bot - Draft Update",
            fields: [{ value: this.update.generate() }],
         },
      ];
      const promisedPost = this.sendDM("", { attachments }, this.postID);

      if (isSubmit) {
         this.postID = (await promisedPost).id;
         return this.confirmDraft();
      }

      // Actions
      await this.generateOptions();

      if (this.state == "review" && this.options.length == 0) {
         this.updateState();
         return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindings: Record<string, any> = {
         app_id,
         location: "embedded",
         description: `> **_${this.label("question")}_**`,
         bindings: [],
      };
      this.options.forEach((option, index) => {
         bindings.bindings.push({
            location: index.toString(),
            label: option.name,
            submit: {
               path: option.url ?? `/update/form`,
               expand: {
                  acting_user: "summary",
               },
               state: {
                  type: option.type,
                  index: index.toString(),
               },
            },
         });
      });
      const createdPost = await promisedPost;
      this.postID = createdPost.id;
      const { id } = await this.sendDM(
         "",
         { app_bindings: [bindings] },
         this.confirmID,
      );
      this.confirmID = id;
      // const fields = [{ value: this.update.generate() }];
      // if (!isSubmit)
      //    fields.push({ value: `--- \n > **_${this.label("question")}_**` });

      return;
   }

   async confirmDraft() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindings: Record<string, any>[] = [
         {
            app_id,
            location: "embedded",
            description: `> **_${this.label("question")}_**`,
            bindings: [
               {
                  location: "edit",
                  label: "Edit",
                  submit: {
                     path: "/update/edit",
                     expand: {
                        acting_user: "summary",
                     },
                  },
               },
               {
                  location: "submit",
                  label: "Submit",
                  submit: {
                     path: "/update/submit",
                     expand: {
                        acting_user_access_token: "all",
                        acting_user: "summary",
                     },
                  },
               },
            ],
         },
      ];
      const { id } = await this.sendDM(
         "",
         { app_bindings: bindings },
         this.confirmID,
      );
      this.confirmID = id;
   }

   async publishUpdate(token) {
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
      if (token) {
         try {
            const userClient = new Client4();
            userClient.setToken(token);
            userClient.setUrl(this.siteUrl);
            await userClient.createPost(post);
         } catch (e) {
            console.log("Error posting as userclient", e);
            console.log("Trying as Bot Client");
            try {
               await this.botClient.createPost(post);
            } catch (e) {
               console.log("That failed too", e);
            }
         }
      } else {
         console.log("Missing user access token, publishing as bot");
         this.botClient.createPost(post);
      }
      // also update the draft dm post
      this.sendDM("Thanks for your Update!", { attachments }, this.postID);
      this.sendDM(
         ":pencil: Reminder: Make sure your task statuses are updated in the GitHub [project](https://github.com/orgs/digi-serve/projects/2)",
         {},
         this.confirmID,
      );

      this.history = {
         date: new Date(),
         goals: this.update.goals,
      };

      kvStore(this.botClient.getToken(), this.siteUrl).addTo(
         "history",
         this.userID,
         this.history,
      );
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

   generateEditForm() {
      const fields: AppField[] = [];

      Object.values(UPDATE_TYPES)
         .filter((key) => typeof key == "string")
         .forEach((key) => {
            const field = {
               name: key as string,
               modal_label: label(
                  "update",
                  "question",
                  key as keyof typeof UPDATE_TYPES,
               ),
               type: "text",
               subtype: "textarea",
               value: this.update.generate(key as keyof typeof UPDATE_TYPES),
               is_required: key == "accomplished" || key == "goal",
            };
            fields.push(field);
         });
      const form: AppForm = {
         title: "Edit your update",
         submit: {
            path: `/update/edit/submit`,
            expand: {
               acting_user: "summary",
            },
         },
         icon: "/meeting.png",
         fields,
      };
      return form;
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
         url: `/update/next`,
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
            this.options = [];
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
   botToken?: string,
) {
   if (!updaters[id]) {
      if (!botToken)
         throw new Error(
            `No updater found for ${id} and no bot token was given... unable create an updater`,
         );
      const newUpdater = new UpdateBuilder(app, botToken);
      updaters[id] = newUpdater;

      await newUpdater.init(id);
   }
   const updater = updaters[id];
   if (botToken) updater.token = botToken;
   if (!updater.hasGithubIntegration && app.locals.githubIntegration) {
      updater.githubIntegration = app.locals.githubIntegration;
   }
   return updater;
}

export async function deleteUpdater(id: string) {
   if (updaters[id]) {
      delete updaters[id];
   }
}
