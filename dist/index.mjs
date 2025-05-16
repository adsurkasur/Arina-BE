import express from "express";
import { createServer } from "http";
import { v4 } from "uuid";
import { MongoClient } from "mongodb";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { defineConfig, createLogger, createServer as createServer$1 } from "vite";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
let db = null;
let mongoClient = null;
async function connectToMongo() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI not set");
  }
  if (mongoClient && db) {
    return db;
  }
  mongoClient = new MongoClient(process.env.MONGO_URI);
  await mongoClient.connect();
  db = mongoClient.db();
  console.log("Connected to MongoDB");
  return db;
}
async function initializeDb() {
  try {
    await connectToMongo();
    console.log("Successfully connected to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDb() first.");
  }
  return db;
}
process.on("SIGINT", async () => {
  if (mongoClient) {
    await mongoClient.close();
    console.log("MongoDB connection closed");
  }
  process.exit(0);
});
const chatConversationSchema = z.object({
  user_id: z.string(),
  title: z.string()
});
const chatMessageSchema = z.object({
  conversation_id: z.string(),
  role: z.string(),
  // 'user' or 'assistant'
  content: z.string(),
  sender_id: z.string()
});
class DatabaseStorage {
  async getUser(id) {
    const user = await getDb().collection("users").findOne({ id });
    if (!user) return void 0;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      photo_url: user.photo_url ?? null,
      created_at: user.created_at ?? null
    };
  }
  async getUserByEmail(email) {
    const user = await getDb().collection("users").findOne({ email });
    if (!user) return void 0;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      photo_url: user.photo_url ?? null,
      created_at: user.created_at ?? null
    };
  }
  async createUser(userData) {
    const user = {
      ...userData,
      created_at: /* @__PURE__ */ new Date()
    };
    await getDb().collection("users").insertOne(user);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      photo_url: user.photo_url ?? null,
      created_at: user.created_at ?? null
    };
  }
  async getConversations(userId) {
    const results = await getDb().collection("chat_conversations").find({ user_id: userId }).sort({ updated_at: -1 }).toArray();
    return results.map((c) => ({
      id: c.id,
      user_id: c.user_id,
      title: c.title,
      created_at: c.created_at ?? null,
      updated_at: c.updated_at ?? null
    }));
  }
  async getConversation(id) {
    const c = await getDb().collection("chat_conversations").findOne({ id });
    if (!c) return void 0;
    return {
      id: c.id,
      user_id: c.user_id,
      title: c.title,
      created_at: c.created_at ?? null,
      updated_at: c.updated_at ?? null
    };
  }
  async createConversation(conversationData) {
    try {
      chatConversationSchema.parse(conversationData);
      const conversation = {
        id: v4(),
        ...conversationData,
        created_at: /* @__PURE__ */ new Date(),
        updated_at: /* @__PURE__ */ new Date()
      };
      await getDb().collection("chat_conversations").insertOne(conversation);
      return conversation;
    } catch (error) {
      console.error("Error creating conversation:", error);
      throw new Error("Failed to create conversation");
    }
  }
  async updateConversation(id, data) {
    const updateData = {
      ...data,
      updated_at: /* @__PURE__ */ new Date()
    };
    const result = await getDb().collection("chat_conversations").findOneAndUpdate(
      { id },
      { $set: updateData },
      { returnDocument: "after" }
    );
    if (!result || !result.value) throw new Error("Conversation not found");
    const c = result.value;
    return {
      id: c.id,
      user_id: c.user_id,
      title: c.title,
      created_at: c.created_at ?? null,
      updated_at: c.updated_at ?? null
    };
  }
  async deleteConversation(id) {
    try {
      await getDb().collection("chat_conversations").deleteOne({ id });
      await getDb().collection("chat_messages").deleteMany({ conversation_id: id });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      throw new Error("Failed to delete conversation");
    }
  }
  async getMessages(conversationId, limit = 50, skip = 0) {
    try {
      const results = await getDb().collection("chat_messages").find({ conversation_id: conversationId }).sort({ created_at: 1 }).skip(skip).limit(limit).toArray();
      return results.map((m) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        role: m.role,
        content: m.content,
        created_at: m.created_at ?? null
      }));
    } catch (error) {
      console.error("Error fetching messages:", error);
      throw new Error("Failed to fetch messages");
    }
  }
  async createMessage(messageData) {
    try {
      chatMessageSchema.parse(messageData);
      const message = {
        id: v4(),
        ...messageData,
        created_at: /* @__PURE__ */ new Date()
      };
      await getDb().collection("chat_messages").insertOne(message);
      await getDb().collection("chat_conversations").updateOne(
        { id: messageData.conversation_id },
        { $set: { updated_at: /* @__PURE__ */ new Date() } }
      );
      return message;
    } catch (error) {
      console.error("Error creating message:", error);
      throw new Error("Failed to create message");
    }
  }
  async getAnalysisResults(userId, type) {
    const query = type ? { user_id: userId, type } : { user_id: userId };
    const results = await getDb().collection("analysis_results").find(query).sort({ updated_at: -1 }).toArray();
    return results.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      data: r.data,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null
    }));
  }
  async getAnalysisResult(id) {
    const r = await getDb().collection("analysis_results").findOne({ id });
    if (!r) return void 0;
    return {
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      data: r.data,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null
    };
  }
  async getRecommendationSets(userId) {
    const results = await getDb().collection("recommendation_sets").find({ user_id: userId }).sort({ created_at: -1 }).toArray();
    return results.map((s) => ({
      id: s.id,
      user_id: s.user_id,
      summary: s.summary,
      created_at: s.created_at ?? null
    }));
  }
  async getRecommendationSet(id) {
    const s = await getDb().collection("recommendation_sets").findOne({ id });
    if (!s) return void 0;
    return {
      id: s.id,
      user_id: s.user_id,
      summary: s.summary,
      created_at: s.created_at ?? null
    };
  }
  async getRecommendationItems(setId) {
    const results = await getDb().collection("recommendation_items").find({ set_id: setId }).sort({ created_at: -1 }).toArray();
    return results.map((i) => ({
      id: i.id,
      set_id: i.set_id,
      title: i.title,
      type: i.type,
      description: i.description,
      confidence: i.confidence,
      data: i.data,
      source: i.source,
      created_at: i.created_at ?? null
    }));
  }
  async createRecommendationSet(setData) {
    const set = {
      id: v4(),
      ...setData,
      created_at: /* @__PURE__ */ new Date()
    };
    await getDb().collection("recommendation_sets").insertOne(set);
    return set;
  }
  async createRecommendationItem(itemData) {
    const item = {
      id: v4(),
      ...itemData,
      created_at: /* @__PURE__ */ new Date()
    };
    await getDb().collection("recommendation_items").insertOne(item);
    return item;
  }
  async createAnalysisResult(resultData) {
    const result = {
      id: v4(),
      ...resultData,
      created_at: /* @__PURE__ */ new Date(),
      updated_at: /* @__PURE__ */ new Date()
    };
    await getDb().collection("analysis_results").insertOne(result);
    return result;
  }
  async deleteRecommendationSet(id) {
    await getDb().collection("recommendation_sets").deleteOne({ id });
    await getDb().collection("recommendation_items").deleteMany({ set_id: id });
  }
  async deleteAnalysisResult(id) {
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
const storage = new DatabaseStorage();
function sortByRecency(results) {
  return [...results].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });
}
function extractBusinessRecommendations(results) {
  const recommendations = [];
  const businessResults = sortByRecency(results.filter((r) => r.type === "business_feasibility"));
  const recentBusinessResults = businessResults.slice(0, 3);
  recentBusinessResults.forEach((result) => {
    const data = result.data;
    if (data.profitMargin && data.profitMargin > 0.25) {
      recommendations.push({
        id: `biz-profit-${result.id}`,
        type: "business",
        title: "Profitable Business Model",
        description: `Your ${data.businessName} shows a strong profit margin of ${(data.profitMargin * 100).toFixed(1)}%. Consider scaling operations while maintaining current cost structure.`,
        confidence: 0.8,
        data: {
          profitMargin: data.profitMargin,
          roi: data.roi,
          businessName: data.businessName
        },
        source: "analysis",
        createdAt: /* @__PURE__ */ new Date()
      });
    }
    if (data.roi && data.roi > 0.15) {
      recommendations.push({
        id: `biz-roi-${result.id}`,
        type: "business",
        title: "Strong Return on Investment",
        description: `Your investment in ${data.businessName} shows a ${(data.roi * 100).toFixed(1)}% ROI. Consider additional investment in similar ventures.`,
        confidence: 0.75,
        data: {
          roi: data.roi,
          paybackPeriod: data.paybackPeriod
        },
        source: "analysis",
        createdAt: /* @__PURE__ */ new Date()
      });
    }
    if (data.operationalCosts && Array.isArray(data.operationalCosts)) {
      const sortedCosts = [...data.operationalCosts].sort((a, b) => b.amount - a.amount);
      if (sortedCosts.length > 0) {
        const highestCost = sortedCosts[0];
        const costPercentage = highestCost.amount / sortedCosts.reduce((sum, cost) => sum + cost.amount, 0);
        if (costPercentage > 0.3) {
          recommendations.push({
            id: `biz-cost-${result.id}`,
            type: "resource",
            title: "Cost Reduction Opportunity",
            description: `${highestCost.name} represents ${(costPercentage * 100).toFixed(1)}% of your operational costs. Reducing this could significantly improve profitability.`,
            confidence: 0.7,
            data: {
              costName: highestCost.name,
              costAmount: highestCost.amount,
              percentage: costPercentage
            },
            source: "analysis",
            createdAt: /* @__PURE__ */ new Date()
          });
        }
      }
    }
    if (data.breakEvenUnits && data.monthlySalesVolume) {
      const breakEvenRatio = data.breakEvenUnits / data.monthlySalesVolume;
      if (breakEvenRatio < 0.5) {
        recommendations.push({
          id: `biz-breakeven-${result.id}`,
          type: "business",
          title: "Favorable Break-Even Point",
          description: `You reach break-even at just ${(breakEvenRatio * 100).toFixed(1)}% of your monthly sales volume. This gives you a safety margin in market fluctuations.`,
          confidence: 0.85,
          data: {
            breakEvenUnits: data.breakEvenUnits,
            monthlySalesVolume: data.monthlySalesVolume,
            ratio: breakEvenRatio
          },
          source: "analysis",
          createdAt: /* @__PURE__ */ new Date()
        });
      }
    }
  });
  return recommendations;
}
function extractForecastRecommendations(results) {
  const recommendations = [];
  const forecastResults = sortByRecency(results.filter((r) => r.type === "demand_forecast"));
  const recentForecasts = forecastResults.slice(0, 3);
  recentForecasts.forEach((result) => {
    const data = result.data;
    if (data.forecasted && Array.isArray(data.forecasted) && data.forecasted.length > 1) {
      const firstForecast = data.forecasted[0].forecast;
      const lastForecast = data.forecasted[data.forecasted.length - 1].forecast;
      const growthRate = (lastForecast - firstForecast) / firstForecast;
      if (growthRate > 0.1) {
        recommendations.push({
          id: `forecast-growth-${result.id}`,
          type: "market",
          title: "Growing Demand Trend",
          description: `Demand for ${data.productName} is projected to grow by ${(growthRate * 100).toFixed(1)}% over the forecast period. Consider increasing production capacity.`,
          confidence: 0.75,
          data: {
            productName: data.productName,
            growthRate,
            firstForecast,
            lastForecast
          },
          source: "analysis",
          createdAt: /* @__PURE__ */ new Date()
        });
      } else if (growthRate < -0.1) {
        recommendations.push({
          id: `forecast-decline-${result.id}`,
          type: "market",
          title: "Declining Demand Alert",
          description: `Demand for ${data.productName} is projected to decline by ${(Math.abs(growthRate) * 100).toFixed(1)}% over the forecast period. Consider diversifying your product mix.`,
          confidence: 0.75,
          data: {
            productName: data.productName,
            declineRate: Math.abs(growthRate),
            firstForecast,
            lastForecast
          },
          source: "analysis",
          createdAt: /* @__PURE__ */ new Date()
        });
      }
    }
    if (data.chart && data.chart.historical && Array.isArray(data.chart.historical)) {
      const values = data.chart.historical.map((h) => h.value);
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      const peaks = values.filter((v) => v > avg * 1.2).length;
      if (peaks >= 2) {
        recommendations.push({
          id: `forecast-seasonal-${result.id}`,
          type: "market",
          title: "Seasonal Demand Pattern",
          description: `${data.productName} shows seasonal demand patterns with ${peaks} peak periods. Plan inventory and production to align with these patterns.`,
          confidence: 0.7,
          data: {
            productName: data.productName,
            peakPeriods: peaks,
            averageDemand: avg
          },
          source: "pattern",
          createdAt: /* @__PURE__ */ new Date()
        });
      }
    }
    if (data.accuracy) {
      if (data.accuracy.mape && data.accuracy.mape < 10) {
        recommendations.push({
          id: `forecast-accuracy-${result.id}`,
          type: "business",
          title: "High Forecast Reliability",
          description: `Your ${data.productName} forecast has a high accuracy (MAPE: ${data.accuracy.mape.toFixed(1)}%). Use this forecast with confidence for planning.`,
          confidence: 0.8,
          data: {
            productName: data.productName,
            mape: data.accuracy.mape
          },
          source: "analysis",
          createdAt: /* @__PURE__ */ new Date()
        });
      } else if (data.accuracy.mape && data.accuracy.mape > 20) {
        recommendations.push({
          id: `forecast-inaccuracy-${result.id}`,
          type: "business",
          title: "Forecast Uncertainty Alert",
          description: `Your ${data.productName} forecast has a higher error rate (MAPE: ${data.accuracy.mape.toFixed(1)}%). Consider using more historical data or adjusting your forecast method.`,
          confidence: 0.7,
          data: {
            productName: data.productName,
            mape: data.accuracy.mape
          },
          source: "analysis",
          createdAt: /* @__PURE__ */ new Date()
        });
      }
    }
  });
  return recommendations;
}
function extractOptimizationRecommendations(results) {
  const recommendations = [];
  const optimizationResults = sortByRecency(results.filter((r) => r.type === "optimization"));
  const recentOptimizations = optimizationResults.slice(0, 3);
  recentOptimizations.forEach((result) => {
    const data = result.data;
    if (data.feasible === true) {
      recommendations.push({
        id: `opt-feasible-${result.id}`,
        type: "resource",
        title: "Optimal Resource Allocation",
        description: `Your ${data.name} optimization model has a feasible solution with ${data.objectiveValue ? "an objective value of " + data.objectiveValue.toFixed(2) : "optimized resource allocation"}.`,
        confidence: 0.9,
        data: {
          optimizationName: data.name,
          objectiveValue: data.objectiveValue
        },
        source: "analysis",
        createdAt: /* @__PURE__ */ new Date()
      });
      if (data.variables && Array.isArray(data.variables)) {
        const significantVariables = data.variables.filter((v) => v.value > 0).sort((a, b) => b.value - a.value).slice(0, 3);
        if (significantVariables.length > 0) {
          const varList = significantVariables.map((v) => `${v.name}: ${v.value.toFixed(2)}`).join(", ");
          recommendations.push({
            id: `opt-resources-${result.id}`,
            type: "resource",
            title: "Key Resource Allocation",
            description: `Focus on these resources for optimal results: ${varList}`,
            confidence: 0.8,
            data: {
              optimizationName: data.name,
              topResources: significantVariables
            },
            source: "analysis",
            createdAt: /* @__PURE__ */ new Date()
          });
        }
      }
      if (data.constraints && Array.isArray(data.constraints)) {
        const bindingConstraints = data.constraints.filter((c) => c.slack === 0 || Math.abs(c.slack) < 1e-3).map((c) => c.name);
        if (bindingConstraints.length > 0) {
          recommendations.push({
            id: `opt-constraints-${result.id}`,
            type: "business",
            title: "Resource Bottlenecks Identified",
            description: `These factors are limiting your optimization: ${bindingConstraints.join(", ")}. Consider increasing these resources.`,
            confidence: 0.85,
            data: {
              optimizationName: data.name,
              bindingConstraints
            },
            source: "analysis",
            createdAt: /* @__PURE__ */ new Date()
          });
        }
      }
    } else if (data.feasible === false) {
      recommendations.push({
        id: `opt-infeasible-${result.id}`,
        type: "business",
        title: "Resource Constraints Too Tight",
        description: `Your ${data.name} optimization model doesn't have a feasible solution. Consider relaxing some constraints or adding more resources.`,
        confidence: 0.9,
        data: {
          optimizationName: data.name
        },
        source: "analysis",
        createdAt: /* @__PURE__ */ new Date()
      });
    }
  });
  return recommendations;
}
function extractChatInsights(messages) {
  const recommendations = [];
  const keywordMap = {
    "increase": "growth",
    "expand": "growth",
    "grow": "growth",
    "profit": "profit",
    "revenue": "profit",
    "cost": "cost",
    "expense": "cost",
    "save": "cost",
    "risk": "risk",
    "market": "market",
    "demand": "market",
    "customer": "market",
    "season": "seasonal",
    "weather": "seasonal",
    "climate": "seasonal",
    "resource": "resource",
    "water": "resource",
    "soil": "resource",
    "fertilizer": "resource",
    "pest": "resource",
    "equipment": "resource"
  };
  const categories = {
    growth: [],
    profit: [],
    cost: [],
    risk: [],
    market: [],
    seasonal: [],
    resource: []
  };
  const sortedMessages = [...messages].filter((m) => m.role === "assistant").sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });
  const recentMessages = sortedMessages.slice(0, 10);
  recentMessages.forEach((message) => {
    const content = message.content.toLowerCase();
    Object.entries(keywordMap).forEach(([keyword, category]) => {
      if (content.includes(keyword)) {
        const sentences = message.content.split(/[.!?]+/);
        const relevantSentences = sentences.filter(
          (s) => s.toLowerCase().includes(keyword)
        );
        if (relevantSentences.length > 0) {
          categories[category].push(
            relevantSentences[0].trim()
          );
        }
      }
    });
  });
  Object.entries(categories).forEach(([category, sentences]) => {
    if (sentences.length > 0) {
      const topSentence = sentences[0];
      let type;
      switch (category) {
        case "growth":
        case "profit":
          type = "business";
          break;
        case "market":
        case "seasonal":
          type = "market";
          break;
        case "resource":
        case "cost":
          type = "resource";
          break;
        default:
          type = "business";
      }
      const title = {
        growth: "Growth Opportunity",
        profit: "Profit Enhancement",
        cost: "Cost Saving Opportunity",
        risk: "Risk Management",
        market: "Market Intelligence",
        seasonal: "Seasonal Planning",
        resource: "Resource Optimization"
      }[category];
      recommendations.push({
        id: `chat-${category}-${Date.now()}`,
        type,
        title: title || "AI Insight",
        description: topSentence,
        confidence: 0.6,
        // Lower confidence for chat-derived insights
        data: {
          category,
          relatedSentences: sentences
        },
        source: "chat",
        createdAt: /* @__PURE__ */ new Date()
      });
    }
  });
  return recommendations;
}
function addSeasonalRecommendations(currentSeason) {
  if (!currentSeason) return [];
  const recommendations = [];
  const seasonalCrops = {
    spring: ["Corn", "Soybeans", "Rice", "Cotton", "Vegetables"],
    summer: ["Sunflower", "Sorghum", "Millet", "Vegetables", "Fruits"],
    fall: ["Winter Wheat", "Barley", "Rapeseed", "Root vegetables"],
    winter: ["Planning", "Equipment maintenance", "Soil preparation"]
  };
  const seasonalActivities = {
    spring: ["Planting", "Soil preparation", "Fertilizing", "Pest management planning"],
    summer: ["Irrigation management", "Pest control", "Crop monitoring", "Early harvest planning"],
    fall: ["Harvesting", "Storage preparation", "Market research", "Winter crop planting"],
    winter: ["Equipment maintenance", "Financial planning", "Education", "Crop planning"]
  };
  recommendations.push({
    id: `seasonal-crop-${Date.now()}`,
    type: "crop",
    title: `${currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1)} Crop Recommendations`,
    description: `Consider focusing on these crops this ${currentSeason}: ${seasonalCrops[currentSeason].join(", ")}.`,
    confidence: 0.7,
    data: {
      season: currentSeason,
      recommendedCrops: seasonalCrops[currentSeason]
    },
    source: "seasonal",
    createdAt: /* @__PURE__ */ new Date()
  });
  recommendations.push({
    id: `seasonal-activity-${Date.now()}`,
    type: "business",
    title: `${currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1)} Activity Focus`,
    description: `Key activities for this ${currentSeason}: ${seasonalActivities[currentSeason].join(", ")}.`,
    confidence: 0.7,
    data: {
      season: currentSeason,
      recommendedActivities: seasonalActivities[currentSeason]
    },
    source: "seasonal",
    createdAt: /* @__PURE__ */ new Date()
  });
  return recommendations;
}
function generateRecommendations(input) {
  let allRecommendations = [];
  const sortedResults = sortByRecency(input.analysisResults).slice(0, 10);
  const businessRecs = extractBusinessRecommendations(sortedResults);
  const forecastRecs = extractForecastRecommendations(sortedResults);
  const optimizationRecs = extractOptimizationRecommendations(sortedResults);
  const chatRecs = extractChatInsights(input.chatHistory);
  const seasonalRecs = addSeasonalRecommendations(input.currentSeason);
  allRecommendations = [
    ...businessRecs,
    ...forecastRecs,
    ...optimizationRecs,
    ...chatRecs,
    ...seasonalRecs
  ];
  allRecommendations.sort((a, b) => {
    const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return dateB - dateA;
  });
  allRecommendations.sort((a, b) => {
    const dateA = a.createdAt instanceof Date ? a.createdAt.toDateString() : "";
    const dateB = b.createdAt instanceof Date ? b.createdAt.toDateString() : "";
    if (dateA === dateB) {
      return b.confidence - a.confidence;
    }
    return 0;
  });
  const finalRecommendations = allRecommendations.slice(0, 10);
  const topRecs = finalRecommendations.slice(0, 5);
  let summary = "";
  if (topRecs.length > 0) {
    const businessRec = topRecs.find((r) => r.type === "business");
    const marketRec = topRecs.find((r) => r.type === "market");
    const resourceRec = topRecs.find((r) => r.type === "resource");
    const cropRec = topRecs.find((r) => r.type === "crop");
    const analysisCounts = {
      business: input.analysisResults.filter((r) => r.type === "business_feasibility").length,
      forecast: input.analysisResults.filter((r) => r.type === "demand_forecast").length,
      optimization: input.analysisResults.filter((r) => r.type === "optimization").length
    };
    if (analysisCounts.business > 0 || analysisCounts.forecast > 0 || analysisCounts.optimization > 0) {
      summary = `Based on your ${analysisCounts.business > 0 ? "business feasibility analysis, " : ""}${analysisCounts.forecast > 0 ? "demand forecasting, " : ""}${analysisCounts.optimization > 0 ? "optimization analysis, " : ""}we recommend: `;
    } else {
      summary = "Based on your historical data, we recommend: ";
    }
    if (businessRec) summary += businessRec.title + ". ";
    if (marketRec) summary += marketRec.title + ". ";
    if (resourceRec) summary += resourceRec.title + ". ";
    if (cropRec) summary += cropRec.title + ". ";
    if (input.currentSeason) {
      summary += `Consider adjusting your strategy for the ${input.currentSeason} season.`;
    }
  } else {
    summary = "Insufficient data for personalized recommendations. Continue using Arina to analyze your agricultural business for tailored insights.";
  }
  allRecommendations = finalRecommendations;
  return {
    id: `rec-set-${Date.now()}`,
    userId: input.userId,
    recommendations: allRecommendations,
    summary,
    createdAt: /* @__PURE__ */ new Date()
  };
}
function mapRecommendationSetFromDb(set) {
  return {
    id: set.id,
    userId: set.user_id,
    summary: set.summary,
    createdAt: set.created_at instanceof Date ? set.created_at.toISOString() : set.created_at
  };
}
function mapRecommendationItemFromDb(item) {
  return {
    id: item.id,
    setId: item.set_id,
    type: item.type,
    title: item.title,
    description: item.description,
    confidence: Number(item.confidence),
    data: item.data,
    source: item.source,
    createdAt: item.created_at instanceof Date ? item.created_at.toISOString() : item.created_at
  };
}
class RecommendationService {
  /**
   * Generate recommendations based on user's analysis results and chat history
   */
  async generateRecommendations(params) {
    try {
      const { userId, currentSeason } = params;
      const analysisResults = await storage.getAnalysisResults(userId);
      const conversations = await storage.getConversations(userId);
      const chatMessages = [];
      for (const conversation of conversations) {
        const messages = await storage.getMessages(conversation.id);
        chatMessages.push(...messages);
      }
      const recommendationInput = {
        userId,
        analysisResults,
        chatHistory: chatMessages,
        currentSeason
      };
      const recommendations = generateRecommendations(recommendationInput);
      const setId = v4();
      const setToInsert = {
        id: setId,
        user_id: userId,
        summary: recommendations.summary,
        created_at: /* @__PURE__ */ new Date()
      };
      const recommendationSet = await storage.createRecommendationSet(setToInsert);
      const items = [];
      for (const rec of recommendations.recommendations) {
        const itemToInsert = {
          id: v4(),
          set_id: recommendationSet.id,
          type: rec.type,
          title: rec.title,
          description: rec.description,
          confidence: rec.confidence.toString(),
          data: rec.data,
          source: rec.source,
          created_at: /* @__PURE__ */ new Date()
        };
        const item = await storage.createRecommendationItem(itemToInsert);
        items.push(mapRecommendationItemFromDb(item));
      }
      return {
        ...mapRecommendationSetFromDb(recommendationSet),
        items
      };
    } catch (error) {
      console.error("Error generating recommendations:", error);
      throw error;
    }
  }
  /**
   * Get all recommendation sets for a user
   */
  async getUserRecommendations(userId) {
    try {
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
      console.error("Error getting user recommendations:", error);
      throw error;
    }
  }
  /**
   * Get a specific recommendation set with its items
   */
  async getRecommendationSet(setId) {
    try {
      const set = await storage.getRecommendationSet(setId);
      if (!set) {
        return null;
      }
      const items = (await storage.getRecommendationItems(setId)).map(mapRecommendationItemFromDb);
      return {
        ...mapRecommendationSetFromDb(set),
        items
      };
    } catch (error) {
      console.error("Error getting recommendation set:", error);
      throw error;
    }
  }
  async deleteRecommendationSet(setId) {
    try {
      await storage.deleteRecommendationSet(setId);
    } catch (error) {
      console.error("Error deleting recommendation set:", error);
      throw error;
    }
  }
}
const recommendationService = new RecommendationService();
async function registerRoutes(app2) {
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users", async (req, res) => {
    try {
      const userData = req.body;
      console.log("Creating user with data:", userData);
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        console.log("User already exists:", existingUser);
        return res.json(existingUser);
      }
      const user = await storage.createUser(userData);
      console.log("Created new user:", user);
      res.json(user);
    } catch (error) {
      console.error("Error creating user:", {
        error,
        stack: error.stack,
        body: req.body
      });
      res.status(500).json({
        message: "Failed to create user",
        error: error.message,
        details: process.env.NODE_ENV === "development" ? error.stack : void 0
      });
    }
  });
  app2.get("/api/conversations/:userId", async (req, res) => {
    try {
      const conversations = await storage.getConversations(req.params.userId);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/conversations", async (req, res) => {
    try {
      console.log("Creating conversation with data:", req.body);
      const conversation = await storage.createConversation(req.body);
      console.log("Created conversation:", conversation);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", {
        error,
        stack: error.stack,
        body: req.body
      });
      res.status(500).json({
        message: error.message,
        details: process.env.NODE_ENV === "development" ? error.stack : void 0
      });
    }
  });
  app2.put("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await storage.updateConversation(req.params.id, req.body);
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/conversations/:id", async (req, res) => {
    try {
      await storage.deleteConversation(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/messages/:conversationId", async (req, res) => {
    try {
      const messages = await storage.getMessages(req.params.conversationId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/messages", async (req, res) => {
    try {
      if (!req.body || !req.body.content) {
        return res.status(400).json({
          error: "INVALID_REQUEST",
          message: "Message content is required"
        });
      }
      if (req.body.role === "model" && (!req.body.content || req.body.content.trim() === "")) {
        return res.status(422).json({
          error: "INVALID_MODEL_RESPONSE",
          message: "Model response cannot be empty"
        });
      }
      const message = await storage.createMessage(req.body);
      if (!message) {
        return res.status(500).json({
          error: "MESSAGE_CREATION_FAILED",
          message: "Failed to create message in database"
        });
      }
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({
        error: "SERVER_ERROR",
        message: error.message,
        details: process.env.NODE_ENV === "development" ? error.stack : void 0
      });
    }
  });
  app2.get("/api/analysis", async (req, res) => {
    try {
      const userId = req.query.userId;
      const type = req.query.type;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      const results = await storage.getAnalysisResults(userId, type);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/analysis", async (req, res) => {
    try {
      const result = await storage.createAnalysisResult(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/analysis/:id", async (req, res) => {
    try {
      await storage.deleteAnalysisResult(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error in DELETE /api/analysis/:id:", error);
      res.status(500).json({ message: error.message || "Failed to delete analysis result" });
    }
  });
  app2.get("/api/recommendations/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const recommendations = await recommendationService.getUserRecommendations(userId);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/recommendations/set/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const recommendationSet = await recommendationService.getRecommendationSet(id);
      if (!recommendationSet) {
        return res.status(404).json({ message: "Recommendation set not found" });
      }
      res.json(recommendationSet);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  const generateRecommendationsSchema = z.object({
    userId: z.string(),
    currentSeason: z.enum(["spring", "summer", "fall", "winter"]).optional()
  });
  app2.post("/api/recommendations/generate", async (req, res) => {
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
    } catch (error) {
      console.error("Error generating recommendations:", error);
      const message = error.code === "XX000" ? "Database connection error - please try again later" : error.message || "Failed to generate recommendations";
      res.status(500).json({ message });
    }
  });
  app2.delete("/api/recommendations/:id", async (req, res) => {
    try {
      await recommendationService.deleteRecommendationSet(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}
const viteConfig = defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.ts",
      external: [
        "express",
        "fs",
        "path",
        "http",
        "url",
        "nanoid"
      ]
    },
    target: "node18",
    ssr: true,
    minify: false
  }
});
const viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createServer$1({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function serveStatic(app2) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}. Ensure the client is built and the 'public' directory exists in the correct location.`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
async function collectionExists(collectionName) {
  const collections = await getDb().listCollections({ name: collectionName }).toArray();
  return collections.length > 0;
}
async function migrate() {
  console.log("Running MongoDB migrations...");
  try {
    await initializeDb();
    if (!await collectionExists("users")) {
      await getDb().createCollection("users", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["id", "email", "name"],
            properties: {
              id: { bsonType: "string" },
              email: { bsonType: "string" },
              name: { bsonType: "string" },
              photo_url: { bsonType: ["string", "null"] },
              created_at: { bsonType: "date" }
            }
          }
        }
      });
    }
    if (!await collectionExists("chat_conversations")) {
      await getDb().createCollection("chat_conversations", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["user_id", "title"],
            properties: {
              id: { bsonType: "string" },
              user_id: { bsonType: "string" },
              title: { bsonType: "string" },
              created_at: { bsonType: "date" },
              updated_at: { bsonType: "date" }
            }
          }
        }
      });
    }
    if (!await collectionExists("chat_messages")) {
      await getDb().createCollection("chat_messages", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["conversation_id", "content", "sender_id"],
            properties: {
              id: { bsonType: "string" },
              conversation_id: { bsonType: "string" },
              content: { bsonType: "string" },
              sender_id: { bsonType: "string" },
              created_at: { bsonType: "date" }
            }
          }
        }
      });
    }
    if (!await collectionExists("analysis_results")) {
      await getDb().createCollection("analysis_results", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["user_id", "type", "data"],
            properties: {
              id: { bsonType: "string" },
              user_id: { bsonType: "string" },
              type: { bsonType: "string" },
              data: { bsonType: "object" },
              created_at: { bsonType: "date" },
              updated_at: { bsonType: "date" }
            }
          }
        }
      });
    }
    await getDb().collection("users").createIndex({ email: 1 }, { unique: true });
    await getDb().collection("users").createIndex({ id: 1 }, { unique: true });
    await getDb().collection("chat_conversations").createIndex({ user_id: 1 });
    await getDb().collection("chat_messages").createIndex({ conversation_id: 1 });
    await getDb().collection("chat_messages").createIndex({ created_at: 1 });
    await getDb().collection("analysis_results").createIndex({ user_id: 1 });
    console.log("MongoDB migrations completed successfully");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
}
const app = express();
app.use(express.json());
migrate().catch(console.error);
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path2 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path2.startsWith("/api")) {
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
