import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { recommendationService } from "./services/recommendation-service";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // API routes for user management
  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const userData = req.body;
      console.log('Creating user with data:', userData);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        console.log('User already exists:', existingUser);
        return res.json(existingUser);
      }

      // Create new user if doesn't exist
      const user = await storage.createUser(userData);
      console.log('Created new user:', user);
      res.json(user);
    } catch (error) {
      console.error('Error creating user:', {
        error,
        stack: error.stack,
        body: req.body
      });
      res.status(500).json({ 
        message: 'Failed to create user',
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // API routes for chat conversations
  app.get("/api/conversations/:userId", async (req, res) => {
    try {
      const conversations = await storage.getConversations(req.params.userId);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      console.log('Creating conversation with data:', req.body);
      const conversation = await storage.createConversation(req.body);
      console.log('Created conversation:', conversation);
      res.status(201).json(conversation);
    } catch (error: any) {
      console.error('Error creating conversation:', {
        error,
        stack: error.stack,
        body: req.body
      });
      res.status(500).json({ 
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  app.put("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await storage.updateConversation(req.params.id, req.body);
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      await storage.deleteConversation(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // API routes for chat messages
  app.get("/api/messages/:conversationId", async (req, res) => {
    try {
      const messages = await storage.getMessages(req.params.conversationId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      if (!req.body || !req.body.content) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Message content is required'
        });
      }

      // Validate model response
      if (req.body.role === 'model' && (!req.body.content || req.body.content.trim() === '')) {
        return res.status(422).json({
          error: 'INVALID_MODEL_RESPONSE',
          message: 'Model response cannot be empty'
        });
      }

      const message = await storage.createMessage(req.body);

      if (!message) {
        return res.status(500).json({
          error: 'MESSAGE_CREATION_FAILED',
          message: 'Failed to create message in database'
        });
      }

      res.status(201).json(message);
    } catch (error: any) {
      res.status(500).json({
        error: 'SERVER_ERROR',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // API routes for analysis results
  app.get("/api/analysis", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const type = req.query.type as string | undefined;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const results = await storage.getAnalysisResults(userId, type);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/analysis", async (req, res) => {
    try {
      const result = await storage.createAnalysisResult(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/analysis/:id", async (req, res) => {
    try {
      await storage.deleteAnalysisResult(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error in DELETE /api/analysis/:id:", error);
      res.status(500).json({ message: error.message || "Failed to delete analysis result" });
    }
  });

  // API routes for recommendations
  app.get("/api/recommendations/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const recommendations = await recommendationService.getUserRecommendations(userId);
      res.json(recommendations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/recommendations/set/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const recommendationSet = await recommendationService.getRecommendationSet(id);

      if (!recommendationSet) {
        return res.status(404).json({ message: "Recommendation set not found" });
      }

      res.json(recommendationSet);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate new recommendations
  const generateRecommendationsSchema = z.object({
    userId: z.string(),
    currentSeason: z.enum(['spring', 'summer', 'fall', 'winter']).optional()
  });

  app.post("/api/recommendations/generate", async (req, res) => {
    try {
      const validationResult = generateRecommendationsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          details: validationResult.error.format() 
        });
      }

      const recommendations = await recommendationService.generateRecommendations(validationResult.data);
      res.status(201).json(recommendations);
    } catch (error: any) {
      console.error('Error generating recommendations:', error);
      const message = error.code === 'XX000' ? 
        'Database connection error - please try again later' : 
        error.message || 'Failed to generate recommendations';
      res.status(500).json({ message });
    }
  });

  app.delete("/api/recommendations/:id", async (req, res) => {
    try {
      await recommendationService.deleteRecommendationSet(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}