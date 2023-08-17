import { AppContext } from "@mattermost/types/apps";

// Missing some context when we expand calls
type ExtendedAppContext = {
   bot_user_id: string;
   bot_access_token: string;
   mattermost_site_url: string;
   acting_user_access_token: string;
   acting_user?: {
      id: string;
      roles: string;
      username: string;
      timezone: {
         automaticTimezone: string;
         manualTimezone: string;
         useAutomaticTimezone: string;
      };
   };
   channel: {
      id: string;
      team_id: string;
      channel_id: string;
      display_name: string;
      type: string;
   };
   channel_member: {
      user_id: string;
   };
};

export type AppContext = AppContext & ExtendedAppContext;
