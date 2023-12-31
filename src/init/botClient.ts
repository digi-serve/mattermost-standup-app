// Setup the bot client
import { Client4 } from "@mattermost/client";

import getReminder from "../classes/Reminder";
import githubIntegration from "../classes/Github";
import kvStore from "../utils/kvStore";

// Types
import {
   ChannelSetting,
   GithubSettings,
   ReminderSettings,
} from "../../@types/kvStore";
import { Application } from "express";

export default async function initBotClient(
   site: string,
   token: string,
   botID: string,
   app: Application,
) {
   console.log("Init with", { site, token: !!token, botID });
   const client = new Client4();
   client.setUrl(site);
   client.setToken(token);
   app.locals.botClient = client;
   app.locals.botClientToken = token;
   app.locals.botID = botID;
   app.locals.mattermostUrl = site;

   await initGitHub(app);
   await initChannel(app);
   await initReminders(app);
   app.locals.appReady = true;
}

async function initGitHub(app: Application) {
   if (app.locals.gitHubIntegration) return;
   const botClient = app.locals.botClient;
   const settings = (await kvStore(
      botClient.getToken(),
      app.locals.mattermostUrl,
   ).get("github")) as GithubSettings;
   if (!settings.token || !settings.owner || !settings.project) return;
   app.locals.githubIntegration = await githubIntegration(
      settings.token,
      settings.owner,
      settings.project,
   );
   console.log("Github Integration Initialized");
}

async function initChannel(app: Application) {
   const botClient = app.locals.botClient;
   const channel = (await kvStore(
      botClient.getToken(),
      app.locals.mattermostUrl,
   ).get("channel")) as ChannelSetting;
   app.locals.channel = channel.id;
}

async function initReminders(app: Application) {
   const botClient = app.locals.botClient;
   const reminders = (await kvStore(
      botClient.getToken(),
      app.locals.mattermostUrl,
   ).get("reminders")) as ReminderSettings;
   for (const id in reminders) {
      const setting = reminders[id];
      await getReminder(id, app, setting);
      console.log("Reminder started with", id, setting);
   }
}
