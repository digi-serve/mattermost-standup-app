import { Client4 } from "@mattermost/client";
import { Post } from "@mattermost/types/lib/posts";

export default class BotClient {
   dmID!: string;
   botClient!: Client4;
   botClientID!: string;
   constructor(botClient: Client4) {
      this.botClient = botClient;
   }

   async init(userID: string) {
      console.log("Get Me");
      const bot = await this.botClient.getMe();
      console.log("Me:", bot);
      this.botClientID = bot.id;
      try {
         console.log("Set up dm with", [bot.id, userID]);
         const dm = await this.botClient.createDirectChannel([bot.id, userID]);
         console.log("got the DM setup");
         this.dmID = dm.id;
      } catch (E) {
         console.log("Caught it -->", E);
      }
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
}
