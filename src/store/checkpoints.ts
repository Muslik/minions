import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

export { SqliteSaver };

export function createCheckpointer(dbPath: string): SqliteSaver {
  return SqliteSaver.fromConnString(dbPath);
}
