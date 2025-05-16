import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import {
  User,
  InsertUser,
  ChatConversation,
  InsertChatConversation,
  ChatMessage,
  InsertChatMessage,
  AnalysisResult,
  InsertAnalysisResult,
  RecommendationSet,
  InsertRecommendationSet,
  RecommendationItem,
  InsertRecommendationItem,
} from "arina-shared/schema";
import { z } from "zod";

const chatConversationSchema = z.object({
  user_id: z.string(),
  title: z.string(),
});

const chatMessageSchema = z.object({
  conversation_id: z.string(),
  role: z.string(), // 'user' or 'assistant'
  content: z.string(),
  sender_id: z.string(),
});

export class DatabaseStorage {
  async getUser(id: string): Promise<User | undefined> {
    const user = await getDb().collection("users").findOne({ id });
    if (!user) return undefined;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      photo_url: user.photo_url ?? null,
      created_at: user.created_at ?? null,
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = await getDb().collection("users").findOne({ email });
    if (!user) return undefined;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      photo_url: user.photo_url ?? null,
      created_at: user.created_at ?? null,
    };
  }

  async createUser(userData: InsertUser): Promise<User> {
    const user = {
      ...userData,
      created_at: new Date(),
    };
    await getDb().collection("users").insertOne(user);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      photo_url: user.photo_url ?? null,
      created_at: user.created_at ?? null,
    };
  }

  async getConversations(userId: string): Promise<ChatConversation[]> {
    const results = await getDb()
      .collection("chat_conversations")
      .find({ user_id: userId })
      .sort({ updated_at: -1 })
      .toArray();
    return results.map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      title: c.title,
      created_at: c.created_at ?? null,
      updated_at: c.updated_at ?? null,
    }));
  }

  async getConversation(id: string): Promise<ChatConversation | undefined> {
    const c = await getDb()
      .collection("chat_conversations")
      .findOne({ id });
    if (!c) return undefined;
    return {
      id: c.id,
      user_id: c.user_id,
      title: c.title,
      created_at: c.created_at ?? null,
      updated_at: c.updated_at ?? null,
    };
  }

  async createConversation(
    conversationData: InsertChatConversation,
  ): Promise<ChatConversation> {
    try {
      chatConversationSchema.parse(conversationData);
      const conversation = {
        id: uuidv4(),
        ...conversationData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      await getDb().collection("chat_conversations").insertOne(conversation);
      return conversation;
    } catch (error) {
      console.error("Error creating conversation:", error);
      throw new Error("Failed to create conversation");
    }
  }

  async updateConversation(
    id: string,
    data: Partial<ChatConversation>,
  ): Promise<ChatConversation> {
    const updateData = {
      ...data,
      updated_at: new Date(),
    };
    const result = await getDb()
      .collection("chat_conversations")
      .findOneAndUpdate(
        { id },
        { $set: updateData },
        { returnDocument: "after" },
      );
    if (!result || !result.value) throw new Error("Conversation not found");
    const c = result.value;
    return {
      id: c.id,
      user_id: c.user_id,
      title: c.title,
      created_at: c.created_at ?? null,
      updated_at: c.updated_at ?? null,
    };
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      await getDb().collection("chat_conversations").deleteOne({ id });
      await getDb().collection("chat_messages").deleteMany({ conversation_id: id });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      throw new Error("Failed to delete conversation");
    }
  }

  async getMessages(
    conversationId: string,
    limit: number = 50,
    skip: number = 0,
  ): Promise<ChatMessage[]> {
    try {
      const results = await getDb()
        .collection("chat_messages")
        .find({ conversation_id: conversationId })
        .sort({ created_at: 1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      return results.map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        role: m.role,
        content: m.content,
        created_at: m.created_at ?? null,
      }));
    } catch (error) {
      console.error("Error fetching messages:", error);
      throw new Error("Failed to fetch messages");
    }
  }

  async createMessage(messageData: InsertChatMessage): Promise<ChatMessage> {
    try {
      chatMessageSchema.parse(messageData);
      const message = {
        id: uuidv4(),
        ...messageData,
        created_at: new Date(),
      };
      await getDb().collection("chat_messages").insertOne(message);
      await getDb()
        .collection("chat_conversations")
        .updateOne(
          { id: messageData.conversation_id },
          { $set: { updated_at: new Date() } },
        );
      return message;
    } catch (error) {
      console.error("Error creating message:", error);
      throw new Error("Failed to create message");
    }
  }

  async getAnalysisResults(
    userId: string,
    type?: string,
  ): Promise<AnalysisResult[]> {
    const query = type ? { user_id: userId, type } : { user_id: userId };
    const results = await getDb()
      .collection("analysis_results")
      .find(query)
      .sort({ updated_at: -1 })
      .toArray();
    return results.map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      data: r.data,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
    }));
  }

  async getAnalysisResult(id: string): Promise<AnalysisResult | undefined> {
    const r = await getDb().collection("analysis_results").findOne({ id });
    if (!r) return undefined;
    return {
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      data: r.data,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
    };
  }

  async getRecommendationSets(userId: string): Promise<RecommendationSet[]> {
    const results = await getDb()
      .collection("recommendation_sets")
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .toArray();
    return results.map((s: any) => ({
      id: s.id,
      user_id: s.user_id,
      summary: s.summary,
      created_at: s.created_at ?? null,
    }));
  }

  async getRecommendationSet(
    id: string,
  ): Promise<RecommendationSet | undefined> {
    const s = await getDb().collection("recommendation_sets").findOne({ id });
    if (!s) return undefined;
    return {
      id: s.id,
      user_id: s.user_id,
      summary: s.summary,
      created_at: s.created_at ?? null,
    };
  }

  async getRecommendationItems(setId: string): Promise<RecommendationItem[]> {
    const results = await getDb()
      .collection("recommendation_items")
      .find({ set_id: setId })
      .sort({ created_at: -1 })
      .toArray();
    return results.map((i: any) => ({
      id: i.id,
      set_id: i.set_id,
      title: i.title,
      type: i.type,
      description: i.description,
      confidence: i.confidence,
      data: i.data,
      source: i.source,
      created_at: i.created_at ?? null,
    }));
  }

  async createRecommendationSet(
    setData: InsertRecommendationSet,
  ): Promise<RecommendationSet> {
    const set = {
      id: uuidv4(),
      ...setData,
      created_at: new Date(),
    };
    await getDb().collection("recommendation_sets").insertOne(set);
    return set;
  }

  async createRecommendationItem(
    itemData: InsertRecommendationItem,
  ): Promise<RecommendationItem> {
    const item = {
      id: uuidv4(),
      ...itemData,
      created_at: new Date(),
    };
    await getDb().collection("recommendation_items").insertOne(item);
    return item;
  }

  async createAnalysisResult(resultData: InsertAnalysisResult): Promise<AnalysisResult> {
    const result = {
      id: uuidv4(),
      ...resultData,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await getDb().collection("analysis_results").insertOne(result);
    return result;
  }

  async deleteRecommendationSet(id: string): Promise<void> {
    await getDb().collection("recommendation_sets").deleteOne({ id });
    await getDb().collection("recommendation_items").deleteMany({ set_id: id });
  }

  async deleteAnalysisResult(id: string): Promise<void> {
    try {
      const result = await getDb().collection("analysis_results").deleteOne({ id });
      if (result.deletedCount === 0) {
        throw new Error(`Analysis result with ID ${id} not found`);
      }
    } catch (error) {
      console.error("Error deleting analysis result:", error);
      throw new Error("Failed to delete analysis result");
    }
  }
}

export const storage = new DatabaseStorage();
