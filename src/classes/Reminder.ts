import { Cron } from "croner";
import BotClient from "./BotClient";
import { Application } from "express";
import { ReminderSetting } from "../../@types/kvStore";

export class Reminder extends BotClient {
   private reminderCron!: Cron;
   private hour = 10;
   private minute = 0;
   private timezone!: string;
   private days = ["MON", "TUE", "WED", "THU", "FRI"];
   constructor(
      app: Application,
      userID: string,
      { timezone, hour, minute, excludeDays }: ReminderSetting,
   ) {
      super(app.locals.botClient);
      this.setupReminder(timezone, hour, minute, excludeDays);
      this.init(userID);
   }

   setupReminder(
      timezone: string,
      hour: number = 10,
      minute: number = 0,
      excludeDays: string[] = ["SAT", "SUN"],
   ) {
      this.timezone = timezone;
      this.days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].filter(
         (day) => !excludeDays.includes(day),
      );
      if (hour < 0 || hour > 24)
         return new Error(`Hour should be between 0-24, recieced ${hour}`);
      this.hour = hour;
      if (minute < 0 || minute > 60)
         return new Error(`Minute should be between 0-60, recieced ${minute}`);
      this.minute = minute;
      const cronString = `0 ${minute} ${hour} * * ${this.days.join(",")}`;
      if (this.reminderCron) this.reminderCron.stop();
      this.reminderCron = Cron(cronString, { timezone }, () => this.reminder());
   }

   sendHelpText(preText?: string) {
      return this.sendDM(`${preText}${this.reminderHelpText()}`);
   }

   private hoursToNextReminder() {
      const ms = this.reminderCron.msToNext();
      if (!ms) return 0;
      else return Math.round(ms / 1000 / 60 / 60);
   }

   private reminder() {
      this.sendDM(
         ":calendar: It's time for your Standup report! **Type `/standup start` to begin.**",
      );
   }
   private reminderHelpText() {
      enum Days {
         MON = "Monday",
         TUE = "Tuesday",
         WED = "Wednesday",
         THU = "Thursday",
         FRI = "Friday",
         SAT = "Saturday",
         SUN = "Sunday",
      }
      const days = this.days.map((day) => Days[day]);
      const lastDay = days.pop();
      const dayString =
         days.length < 1 ? lastDay : `${days.join(", ")}, and ${lastDay}`;
      let isAM = true;
      let hour = this.hour;
      if (hour > 12) {
         isAM = false;
         hour = hour - 12;
      }
      return `Remiders will be sent at ${hour}:${
         this.minute > 9 ? this.minute : `0${this.minute}`
      } ${isAM ? "AM" : "PM"} in timezone **${
         this.timezone
      }** on ${dayString} (Next reminder is in about ${this.hoursToNextReminder()} hours)

To change the time run \`/standup settings reminder\`
_Note: Change your timezone in mattermost's setting then run the above command_`;
   }
}

// Reminder instances
const reminders: Record<string, Reminder> = {};

export default function getReminder(
   id: string,
   app: Application,
   settings: ReminderSetting,
) {
   if (!reminders[id]) reminders[id] = new Reminder(app, id, settings);
   return reminders[id];
}
