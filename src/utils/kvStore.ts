// Interact with the kvStore
// https://developers.mattermost.com/integrate/apps/functionality/kv-store/
// <mattermost_site_url>/plugins/com.mattermost.apps/api/v1/kv/<my-key></my-key>
export class KVStore {
   mattermost_site_url: string;
   token: string;

   constructor(authToken: string, url: string) {
      this.mattermost_site_url = url;
      this.token = authToken;
   }

   async get(key: string) {
      try {
         const response = await fetch(
            `${this.mattermost_site_url}/plugins/com.mattermost.apps/api/v1/kv/${key}`,
            {
               method: "GET",
               headers: {
                  Authorization: `Bearer ${this.token}`,
               },
            },
         );
         return response.json();
      } catch (e) {
         console.log(e);
      }
   }
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   async set(key: string, value: Record<string, any> | Record<string, any>[]) {
      const response = await fetch(
         `${this.mattermost_site_url}/plugins/com.mattermost.apps/api/v1/kv/${key}`,
         {
            method: "POST",
            body: JSON.stringify(value),
            headers: {
               Authorization: `Bearer ${this.token}`,
            },
         },
      );
      if (response.ok) {
         console.log(`set key ${key} ok`);
      } else {
         console.log(`set key ${key} error, status: ${response.status}`);
         console.log(`response.text: ${await response.text()}`);
      }
   }

   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   async addTo(key: string, paramName: string, value: Record<string, any>) {
      const values = await this.get(key);
      values[paramName] = value;
      return this.set(key, values);
   }

   async getOne(key: string, paramName: string) {
      const values = await this.get(key);
      return values[paramName] ?? {};
   }

   delete(key: string) {
      return fetch(
         `${this.mattermost_site_url}/plugins/com.mattermost.apps/api/v1/kv/${key}`,
         {
            method: "DELETE",
            headers: {
               Authorization: `Bearer ${this.token}`,
            },
         },
      );
   }
}
const stores: Record<string, KVStore> = {};
export default function (authToken: string, siteUrl: string) {
   if (!stores[authToken]) {
      stores[authToken] = new KVStore(authToken, siteUrl);
   }
   return stores[authToken];
}
