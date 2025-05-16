import { v4 as uuid } from 'uuid';
import { storage } from '../storage';
import { generateRecommendations } from 'arina-shared/recommendation-engine';
import type { 
  RecommendationSet, 
  RecommendationItem, 
  InsertRecommendationSet, 
  InsertRecommendationItem 
} from 'arina-shared/schema';

interface GenerateRecommendationsParams {
  userId: string;
  currentSeason?: 'spring' | 'summer' | 'fall' | 'winter';
}

function mapRecommendationSetFromDb(set: any) {
  return {
    id: set.id,
    userId: set.user_id,
    summary: set.summary,
    createdAt: set.created_at instanceof Date ? set.created_at.toISOString() : set.created_at,
  };
}

function mapRecommendationItemFromDb(item: any) {
  return {
    id: item.id,
    setId: item.set_id,
    type: item.type,
    title: item.title,
    description: item.description,
    confidence: Number(item.confidence),
    data: item.data,
    source: item.source,
    createdAt: item.created_at instanceof Date ? item.created_at.toISOString() : item.created_at,
  };
}

export class RecommendationService {
  /**
   * Generate recommendations based on user's analysis results and chat history
   */
  async generateRecommendations(params: GenerateRecommendationsParams): Promise<any> {
    try {
      const { userId, currentSeason } = params;

      // Get user's analysis results (snake_case from storage)
      const analysisResults = await storage.getAnalysisResults(userId);

      // Get conversations for the user (snake_case from storage)
      const conversations = await storage.getConversations(userId);

      // Get messages from all conversations
      const chatMessages = [];
      for (const conversation of conversations) {
        const messages = await storage.getMessages(conversation.id);
        chatMessages.push(...messages);
      }

      // Generate recommendations (engine expects snake_case fields)
      const recommendationInput = {
        userId,
        analysisResults,
        chatHistory: chatMessages,
        currentSeason
      };

      const recommendations = generateRecommendations(recommendationInput);

      // Store in the database
      const setId = uuid();
      const setToInsert = {
        id: setId,
        user_id: userId,
        summary: recommendations.summary,
        created_at: new Date()
      };
      const recommendationSet = await storage.createRecommendationSet(setToInsert);

      // Create all recommendation items using the correct set ID
      const items: any[] = [];
      for (const rec of recommendations.recommendations) {
        const itemToInsert = {
          id: uuid(),
          set_id: recommendationSet.id,
          type: rec.type,
          title: rec.title,
          description: rec.description,
          confidence: rec.confidence.toString(),
          data: rec.data,
          source: rec.source,
          created_at: new Date()
        };
        const item = await storage.createRecommendationItem(itemToInsert);
        items.push(mapRecommendationItemFromDb(item));
      }

      return {
        ...mapRecommendationSetFromDb(recommendationSet),
        items
      };
    } catch (error) {
      console.error('Error generating recommendations:', error);
      throw error;
    }
  }

  /**
   * Get all recommendation sets for a user
   */
  async getUserRecommendations(userId: string): Promise<any[]> {
    try {
      // Get all recommendation sets for the user
      const sets = await storage.getRecommendationSets(userId);
      const result = [];
      for (const set of sets) {
        const items = (await storage.getRecommendationItems(set.id)).map(mapRecommendationItemFromDb);
        result.push({
          ...mapRecommendationSetFromDb(set),
          items
        });
      }
      return result;
    } catch (error) {
      console.error('Error getting user recommendations:', error);
      throw error;
    }
  }

  /**
   * Get a specific recommendation set with its items
   */
  async getRecommendationSet(setId: string): Promise<any | null> {
    try {
      // Get the recommendation set
      const set = await storage.getRecommendationSet(setId);
      if (!set) {
        return null;
      }
      // Get the items for this set
      const items = (await storage.getRecommendationItems(setId)).map(mapRecommendationItemFromDb);
      return {
        ...mapRecommendationSetFromDb(set),
        items
      };
    } catch (error) {
      console.error('Error getting recommendation set:', error);
      throw error;
    }
  }

  async deleteRecommendationSet(setId: string): Promise<void> {
    try {
      await storage.deleteRecommendationSet(setId);
    } catch (error) {
      console.error('Error deleting recommendation set:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const recommendationService = new RecommendationService();