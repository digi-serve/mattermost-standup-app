import { graphql } from "@octokit/graphql";
import { Cron } from "croner";

import {
   // validate,
   Issue,
   Organization,
   ProjectV2,
   ProjectV2Item,
} from "@octokit/graphql-schema";

interface CustomProjectV2Item extends ProjectV2Item {
   status?: Record<string, string>;
}

interface NormalizedItem {
   title?: string;
   assignees?: Array<string | undefined>;
   reference?: string;
   status?: string;
   updated?: string;
}

export class GitHubIntegration {
   isInitialized = false;
   owner: string;
   private refreshCron!: Cron;
   private graphqlWithAuth: typeof graphql;
   private projectID!: string | undefined;
   private issues: NormalizedItem[] = [];

   constructor(token: string, owner: string) {
      this.owner = owner;
      this.graphqlWithAuth = graphql.defaults({
         owner,
         headers: {
            authorization: `token ${token}`,
         },
      });
   }

   async init({ projectNumber }: { projectNumber: number }) {
      this.projectID = await this.getProjectID(projectNumber);
      console.log(`Initialized with project id ${this.projectID}`);
      this.isInitialized = true;
      // each hour after start
      this.getInprogressIssuesFromGithub();
      this.refreshCron = Cron("? * * * *", () =>
         this.getInprogressIssuesFromGithub(),
      );
      return;
   }

   // Helpful when developing
   // validateSendQuery(
   //    query: string,
   //    variables: Record<string, string | number>,
   // ) {
   //    const errors = validate(query);
   //    if (errors.length > 0) {
   //       const error = new Error("Invalid GitHub Query");
   //       console.error(error, errors);
   //       throw error;
   //    } else {
   //       console.log("valid... continuing");
   //       return this.graphqlWithAuth(query, variables);
   //    }
   // }

   private async getProjectID(projectNumber: number) {
      // console.log("TODO: remove getProjectID override", projectNumber);
      // return "PVT_kwDOBW85Qc095Q";
      const query = `
          query getProjectID($owner: String!, $projectNumber: Int!) {
              organization(login: $owner) {
                  projectV2(number: $projectNumber) {
                      id
                  }
              }
          }
      `;
      const { organization }: { organization: Organization } =
         await this.graphqlWithAuth(query, {
            projectNumber,
            owner: this.owner,
         });
      return organization.projectV2?.id;
   }

   private async getProjectItems(cursor?: string) {
      if (!this.projectID) throw new Error("Missing projectID");
      const query = `
            query getProjectItems($projectID: ID!, $cursor: String $statusField: String="Status") {
                node(id: $projectID) {
                    ... on ProjectV2 {
                        items(first: 100, after: $cursor) {
                            pageInfo {
                                hasNextPage,
                                endCursor
                            }
                            nodes {
                                content {
                                    ... on Issue {
                                        title
                                        assignees(first: 10) {
                                            nodes {
                                                login
                                            } 
                                        }
                                        number
                                        repository {
                                            name
                                        }
                                    }
                                },
                                status: fieldValueByName(name: $statusField) {
                                    ... on ProjectV2ItemFieldSingleSelectValue {
                                        updatedAt,
                                        name, 
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;
      const variables: Record<string, string> = { projectID: this.projectID };
      if (cursor) variables.cursor = cursor;
      const { node } = await this.graphqlWithAuth<{ node: ProjectV2 }>(
         query,
         variables,
      );
      return node;
   }

   // To slow to get from GitHub each time, so get from memory
   getInprogressIssues(since: Date) {
      return this.issues.filter((item) =>
         this.filterInProgressItem(item, since),
      );
   }

   // Keep in progress last 7 days in memory
   private async getInprogressIssuesFromGithub() {
      const today = new Date();
      const since = new Date(
         today.getFullYear(),
         today.getMonth(),
         today.getDate() - 7,
      );
      let hasNext = true;
      let count = 0;
      let cursor: string | undefined = undefined;
      try {
         const inProgressIssues: NormalizedItem[] = [];

         while (hasNext && count < 10) {
            count++;
            const project: ProjectV2 = await this.getProjectItems(cursor);
            hasNext = project.items.pageInfo.hasNextPage;
            cursor = project.items.pageInfo.endCursor ?? undefined;
            project.items.nodes?.forEach((item) => {
               if (!item) return;
               const normalized = this.normalizeItem(item);
               if (this.filterInProgressItem(normalized, since)) {
                  inProgressIssues.push(normalized);
               }
            });
         }
         this.issues = inProgressIssues;
         console.log(`Found ${this.issues.length} issues from GitHub`);
      } catch (error) {
         console.log("Error reading items from GitHub", error);
      }
   }

   private normalizeItem(item: CustomProjectV2Item): NormalizedItem {
      const issue = item.content as Issue;
      return {
         title: item.content?.title,
         reference: issue
            ? `${issue?.repository?.name}#${issue?.number}`
            : undefined,
         assignees:
            item.content?.assignees?.nodes?.map((node) => node?.login) ?? [],
         status: item.status?.name,
         updated: item.status?.updatedAt,
      };
   }

   private filterInProgressItem(item: NormalizedItem, since: Date) {
      if (!item.title || !item.status || !item.updated) return false;
      if (item.status == "📝 Todo") return false;
      const updated = new Date(item.updated);
      if (item.status == "✔ Done" && updated < since) return false;
      return true;
   }
}

// Export a Singleton
let integration: GitHubIntegration;

export default async function (
   githubToken: string,
   githubOwner: string,
   projectNumber: number,
) {
   if (!integration)
      integration = new GitHubIntegration(githubToken, githubOwner);
   if (!integration.isInitialized) await integration.init({ projectNumber });
   return integration;
}
