// Types for data stored in the kvstore

import { Line } from "../classes/Update";

export interface ReminderSetting {
   timezone: string;
   hour?: number;
   minute?: number;
   excludeDays?: string[];
   // accessToken: string;
}

export type ReminderSettings = Record<string, ReminderSetting>;

export interface GithubSettings {
   token: string;
   owner: string;
   project: number;
}

export interface ChannelSetting {
   id: string;
   name: string;
}

export interface UserHistory {
   date: Date;
   goals: Line[];
}
