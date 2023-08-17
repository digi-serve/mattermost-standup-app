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
      const bot = await this.botClient.getMe();
      this.botClientID = bot.id;
      try {
         const dm = await this.botClient.createDirectChannel([bot.id, userID]);
         this.dmID = dm.id;
      } catch (err) {
         console.log(
            `Error creating a direct message channel with ${[bot.id, userID]}`,
            err,
         );
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
