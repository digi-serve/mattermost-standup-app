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
import { AppField, AppForm, AppSelectOption } from "@mattermost/types/lib/apps";
import BotClient from "./BotClient";
import { displayStatuses } from "../utils/statusUpdates";

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
   actionsPostID!: string;
   dmID!: string;
   private _githubIntegration!: GitHubIntegration;
   private _state: STATES = 1;
   private botProfilePicURL!: string;
   private channelID: string;
   private draftPostID!: string;
   private history!: UserHistory;
   private options!: Option[];
   private siteUrl: string;
   private update = new Update();
   private userID!: string;

   constructor(app: Application, token: string) {
      const botClient = new Client4();
      botClient.setToken(token);
      botClient.setUrl(app.locals.mattermostUrl);
      super(botClient);
      this.channelID = app.locals.channel;
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

   set token(token: string) {
      this.botClient.setToken(token);
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
      const createdPost = await this.sendDM("", { attachments }, this.draftPostID);
      this.draftPostID = createdPost.id;
      if (isSubmit) {
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
      const { id } = await this.sendDM(
         "",
         { app_bindings: [bindings] },
         this.actionsPostID,
      );
      this.actionsPostID = id;
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
         this.actionsPostID,
      );
      this.actionsPostID = id;
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
      this.sendDM("Thanks for your Update!", { attachments }, this.draftPostID);
      const refs = this.update.references as string[];
      displayStatuses(refs, this, this._githubIntegration);
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
      submission: {
         issue: Record<string, string>;
         note: string;
         issueOther?: string;
      },
      state: string = "accomplished",
   ): Promise<void> {
      const wasGoal = this.state == "review";
      const type = wasGoal
         ? "accomplished"
         : (state as keyof typeof UPDATE_TYPES);

      this.update.add({
         type,
         reference:
            submission.issue && submission.issue.value != "none"
               ? submission.issue.value
               : submission.issueOther ?? "",
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
   getAddForm(state: keyof typeof UPDATE_TYPES, index: number) {
      const github = this.state != "personal";
      const isReview = this.state == "review";
      let options: AppSelectOption[] = [];
      let githubOptions = false;
      if (github && !isReview) {
         options = this.githubOptions();
         if (options.length > 0) githubOptions = true;
      }
      const fields: AppField[] = [
         {
            name: "note",
            modal_label:
               this.label("note") ??
               state.replace(/^\w/, (x) => x.toUpperCase()),
            type: "text",
            value: isReview ? this.history.goals[index].note : "",
            description: this.label("noteHelp"),
            is_required: true,
         },
      ];
      if (githubOptions) {
         fields.push({
            name: "issue",
            modal_label: "GitHub Issue",
            type: "static_select",
            options: [{ label: "None / Other", value: "none" }, ...options],
            description: "If this is related to a GitHub issue select it here.",
            is_required: true,
         });
      }
      if (github) {
         fields.push({
            name: "issueOther",
            modal_label: githubOptions ? "Other GitHub Issue" : "GitHub Issue",
            type: "text",
            value: isReview ? this.history.goals[index].reference : "",
            description: `Add an issue ${
               githubOptions ? " not in the list above " : ""
            }\`{repo_name}#{issue_number}\`. Leave blank if it's not related to any.`,
         });
      }

      const form: AppForm = {
         submit: {
            path: `/update/add`,
            expand: {
               acting_user: "summary",
            },
            state: {
               updaterState: isReview ? index.toString() : state,
            },
         },
         title: "Add an Item",
         // state: isReview ? index.toString() : state,
         fields,
      };
      return form;
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

   private githubOptions(): AppSelectOption[] {
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
               return { label: text, value };
            })
            .sort((a, b) => (a.label < b.label ? -1 : 1)) ?? []
      );
   }

   private resetNext() {
      this.update = new Update();
      this.actionsPostID = "";
      this.draftPostID = "";
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
