import RedisPackage from "ioredis";
import type { TaskMessage } from "../store/types.js";

export const TASK_STREAM = "task_queue_stream";
export const TASK_GROUP = "task_workers";
export const DELAYED_SET = "task_queue_delayed";

export class RedisQueue {
  private readonly redis: any;

  constructor(redisUrl: string) {
    const RedisCtor = RedisPackage as unknown as { new (url: string): any };
    this.redis = new RedisCtor(redisUrl);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  async ensureConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", TASK_STREAM, TASK_GROUP, "0", "MKSTREAM");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("BUSYGROUP")) {
        throw error;
      }
    }
  }

  async enqueueTask(message: TaskMessage, delayMs = 0): Promise<void> {
    if (delayMs > 0) {
      const dueAt = Date.now() + delayMs;
      await this.redis.zadd(DELAYED_SET, dueAt, JSON.stringify(message));
      return;
    }
    await this.redis.xadd(
      TASK_STREAM,
      "*",
      "taskId",
      message.taskId,
      "runId",
      message.runId,
      "workflowId",
      message.workflowId
    );
  }

  async pumpDelayed(limit = 200): Promise<number> {
    const now = Date.now();
    const raw = await this.redis.zrangebyscore(DELAYED_SET, 0, now, "LIMIT", 0, limit);
    if (raw.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    raw.forEach((entry: string) => {
      pipeline.zrem(DELAYED_SET, entry);
    });
    await pipeline.exec();

    for (const entry of raw) {
      const parsed = JSON.parse(entry) as TaskMessage;
      await this.enqueueTask(parsed);
    }
    return raw.length;
  }
}
