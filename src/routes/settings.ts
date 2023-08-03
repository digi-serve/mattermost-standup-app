// Routes for configuring the app settings
import { Router } from "express";
import {
   respondOk,
   respondMissing,
   respondUnauthorized,
   respondError,
} from "../utils/response";
import { ExtendedContext as Context } from "../../@types/mattermost-extended";
import { Client4 } from "@mattermost/client";
import { Post } from "@mattermost/types/lib/posts";
import kvStore from "../utils/kvStore";
import { getUpdater } from "../classes/UpdateBuilder";
import gitHubIntegration from "../classes/Github";
import {
   GithubSettings,
   ReminderSetting,
   ChannelSetting,
} from "../../@types/kvStore";

const router = Router();

router.post("/register/channel", async (req, res) => {
   const context = req.body.context as Context;
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
   const context = req.body.context as Context;
   const botClient = req.app.locals.botClient as Client4;
   const { acting_user: actingUser, acting_user_access_token: accessToken } =
      context;

   // Validations
   if (!botClient) return respondMissing(res, "bot client not initialized");
   if (!actingUser) return respondMissing(res, "acting_user");
   if (!accessToken) return respondMissing(res, "acting_user_access_token");

   const botStore = kvStore(botClient.getToken(), req.app.locals.mattermostUrl);

   const channel = await botStore.get("channel");
   if (!channel.id || channel.id != context.channel.id) {
      return respondMissing(res, "Channel not setup for standups!");
   }

   const updater = await getUpdater(actingUser.id, req.app);
   const timezone = getTimezone(actingUser);
   const message = updater.setupReminder(timezone);

   const post = {
      channel_id: updater.dmID,
      message: `Standups registered for **${channel.name}**\n\n${message}`,
   } as Post;
   botClient.createPost(post);

   const reminder: ReminderSetting = {
      timezone,
   };
   botStore.addTo("reminders", actingUser.id, reminder);
   respondOk(res);
});

router.post("/reminder", async (req, res) => {
   const context = req.body.context as Context;
   const botClient = req.app.locals.botClient;
   const { acting_user: actingUser, acting_user_access_token: accessToken } =
      context;

   // Validations
   if (!botClient) return respondMissing(res, "bot client not initialized");
   if (!actingUser) return respondMissing(res, "acting_user");
   if (!accessToken) return respondMissing(res, "acting_user_access_token");

   const botStore = kvStore(botClient.getToken(), req.app.locals.mattermostUrl);

   const values = req.body.values;

   const reminder = (await botStore.getOne(
      "reminders",
      actingUser.id,
   )) as ReminderSetting;
   // Merge stored value with new values
   reminder.timezone = getTimezone(actingUser);
   if (values.hour) reminder.hour = values.hour;
   if (values.minute) reminder.minute = values.minute;
   if (values["skip-days"])
      reminder.excludeDays = values["skip-days"].split(", ");

   const updater = await getUpdater(actingUser.id, req.app, accessToken);
   const message = updater.setupReminder(
      reminder.timezone,
      reminder.hour,
      reminder.minute,
      reminder.excludeDays,
   );

   const post = {
      channel_id: updater.dmID,
      message: `Reminder updated: \n\n${message}`,
   } as Post;
   botClient.createPost(post);

   botStore.addTo("reminders", actingUser.id, reminder);
   respondOk(res);
});

router.post("/github", async (req, res) => {
   const context = req.body.context as Context;
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
