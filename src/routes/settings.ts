// Routes for configuring the app settings
import { Router } from "express";
import {
   respondOk,
   respondMissing,
   respondUnauthorized,
   respondError,
} from "../utils/response";
import { Client4 } from "@mattermost/client";
import { Post } from "@mattermost/types/lib/posts";
import kvStore from "../utils/kvStore";
import gitHubIntegration from "../classes/Github";
import {
   GithubSettings,
   ReminderSetting,
   ChannelSetting,
} from "../../@types/kvStore";
import { AppContext } from "../../@types/mattermost";
import getReminder from "../classes/Reminder";

const router = Router();

router.post("/register/channel", async (req, res) => {
   const context = req.body.context as AppContext;
   const botClient = req.app.locals.botClient as Client4;
   //    if (!botClient) return respondError(res, "bot client not initialized");
   if (!context.acting_user?.roles.includes("system_admin")) {
      return respondUnauthorized(res, "Requires system_admin role");
   }
   if (context.channel.type == "D") {
      return respondError(
         res,
         "This is a direct message, run this command from a valid channel",
         400,
      );
   }
   const adminClient = new Client4();
   adminClient.setUrl(req.app.locals.mattermostUrl);
   adminClient.setToken(context.acting_user_access_token);
   await adminClient.addToTeam(context.channel.team_id, context.bot_user_id);
   await adminClient.addToChannel(context.bot_user_id, context.channel.id);
   const token = botClient.getToken();
   const setting: ChannelSetting = {
      id: context.channel.id,
      name: context.channel.display_name,
   };
   await kvStore(token, req.app.locals.mattermostUrl).set("channel", setting);
   const post = {
      channel_id: context.channel.id,
      message:
         "Standups activated. To share a standup type `/standup start` to register for daily reminders type `/standup register user`",
   } as Post;
   botClient.createPost(post);
   respondOk(res);
});

router.post("/register/user", async (req, res) => {
   const context = req.body.context as AppContext;
   const botClient = req.app.locals.botClient as Client4;
   const { acting_user: actingUser } = context;

   // Validations
   if (!botClient) return respondMissing(res, "bot client not initialized");
   if (!actingUser) return respondMissing(res, "acting_user");

   const botStore = kvStore(botClient.getToken(), req.app.locals.mattermostUrl);

   const channel = await botStore.get("channel");
   if (!channel.id || channel.id != context.channel.id) {
      return respondMissing(res, "Channel not setup for standups!");
   }

   const timezone = getTimezone(actingUser);
   const setting: ReminderSetting = {
      timezone,
   };
   const reminder = await getReminder(actingUser.id, req.app, setting);
   reminder.dmID;
   // const message = updater.setupReminder(timezone);

   const post = {
      channel_id: reminder.dmID,
      message: `Standups registered for **${channel.name}**`,
   } as Post;
   await botClient.createPost(post);
   reminder.sendHelpText();

   botStore.addTo("reminders", actingUser.id, setting);
   respondOk(res);
});

router.post("/reminder", async (req, res) => {
   const context = req.body.context as AppContext;
   const botClient = req.app.locals.botClient;
   const { acting_user: actingUser } = context;

   // Validations
   if (!botClient) return respondMissing(res, "bot client not initialized");
   if (!actingUser) return respondMissing(res, "acting_user");

   const botStore = kvStore(botClient.getToken(), req.app.locals.mattermostUrl);

   const values = req.body.values;

   const settings = (await botStore.getOne(
      "reminders",
      actingUser.id,
   )) as ReminderSetting;
   // Merge stored value with new values
   settings.timezone = getTimezone(actingUser);
   if (values.hour) settings.hour = values.hour;
   if (values.minute) settings.minute = values.minute;
   if (values["skip-days"])
      settings.excludeDays = values["skip-days"].split(", ");

   const reminder = await getReminder(actingUser.id, req.app, settings);
   reminder.setupReminder(
      settings.timezone,
      settings.hour,
      settings.minute,
      settings.excludeDays,
   );
   reminder.sendHelpText("Reminder updated: \n\n");

   botStore.addTo("reminders", actingUser.id, reminder);
   respondOk(res);
});

router.post("/github", async (req, res) => {
   const context = req.body.context as AppContext;
   if (!context.acting_user?.roles.includes("system_admin"))
      return respondUnauthorized(res, "Requires system_admin role");
   const { botClient } = req.app.locals;
   const values = req.body.values as GithubSettings;
   req.app.locals = await gitHubIntegration(
      values.token,
      values.owner,
      values.project,
   );
   kvStore(botClient.getToken(), req.app.locals.mattermostUrl).set(
      "github",
      req.body.values,
   );
   respondOk(res);
});

function getTimezone(acting_user) {
   return acting_user.timezone.useAutomaticTimezone == "true"
      ? acting_user.timezone.automaticTimezone
      : acting_user.timezone.manualTimezone;
}

export default router;
