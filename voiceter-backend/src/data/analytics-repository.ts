/**
 * Analytics Repository
 * 
 * Handles persistence and aggregation of analytics data to DynamoDB demo-analytics table.
 * 
 * Requirements:
 * - REQ-DATA-001: Table 4 schema (demo-analytics)
 * - REQ-DATA-005: Aggregate Analytics Data
 */

import { getDynamoDBClient } from './dynamodb';
import { AnalyticsRecord, SessionRecord, AnalyticsTrend } from './types';
import { getLogger } from '../monitoring/logger';
import {
  withDatabaseErrorHandling,
  withDatabaseErrorHandlingVoid,
} from './error-handler';

const logger = getLogger();

/**
 * Analytics Repository for DynamoDB operations
 */
export class AnalyticsRepository {
  private tableName = 'analytics';
  private dynamoClient = getDynamoDBClient();

  /**
   * Save or update analytics record
   * 
   * Requirements:
   * - REQ-DATA-005: Store aggregated analytics per questionnaire per day
   */
  async saveAnalytics(analytics: AnalyticsRecord, continueOnFailure = true): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        await this.dynamoClient.putItem(this.tableName, analytics);
        
        const duration = Date.now() - startTime;
        logger.info('Analytics saved', {
          date: analytics.date,
          questionnaireId: analytics.questionnaireId,
          totalSessions: analytics.totalSessions,
          duration,
        });
      },
      {
        operationName: 'saveAnalytics',
        continueOnFailure,
      }
    );
  }

  /**
   * Get analytics for a specific date and questionnaire
   */
  async getAnalytics(
    date: string,
    questionnaireId: string,
    continueOnFailure = false
  ): Promise<AnalyticsRecord | null> {
    const startTime = Date.now();
    
    return await withDatabaseErrorHandling(
      async () => {
        const result = await this.dynamoClient.getItem(this.tableName, {
          date,
          questionnaireId,
        });

        const duration = Date.now() - startTime;
        logger.debug('Analytics retrieved', {
          date,
          questionnaireId,
          found: result !== null,
          duration,
        });

        return result as AnalyticsRecord | null;
      },
      {
        operationName: 'getAnalytics',
        continueOnFailure,
      }
    );
  }

  /**
   * Get all analytics for a specific date
   */
  async getAnalyticsByDate(date: string, continueOnFailure = false): Promise<AnalyticsRecord[]> {
    const startTime = Date.now();
    
    const result = await withDatabaseErrorHandling(
      async () => {
        const results = await this.dynamoClient.query(
          this.tableName,
          '#date = :date',
          { ':date': date },
          { '#date': 'date' }
        );

        const duration = Date.now() - startTime;
        logger.debug('Analytics retrieved by date', {
          date,
          count: results.length,
          duration,
        });

        return results as AnalyticsRecord[];
      },
      {
        operationName: 'getAnalyticsByDate',
        continueOnFailure,
      }
    );

    return result || [];
  }

  /**
   * Compute and store analytics for a given date
   * 
   * Requirements:
   * - REQ-DATA-005: Compute analytics daily
   *   - Total sessions started
   *   - Sessions completed
   *   - Completion rate (%)
   *   - Average duration
   *   - Popular voice selections
   *   - Peak usage hours
   */
  async computeAndStoreAnalytics(
    date: string,
    questionnaireId: string,
    sessions: SessionRecord[]
  ): Promise<AnalyticsRecord> {
    logger.info('Computing analytics', {
      date,
      questionnaireId,
      sessionCount: sessions.length,
    });

    // Filter sessions for this questionnaire
    const questionnaireSessions = sessions.filter(
      s => s.questionnaireId === questionnaireId
    );

    // Calculate metrics
    const totalSessions = questionnaireSessions.length;
    const completedSessions = questionnaireSessions.filter(
      s => s.status === 'completed'
    ).length;

    // Calculate average duration (only for sessions with duration)
    const sessionsWithDuration = questionnaireSessions.filter(s => s.duration && s.duration > 0);
    const averageDuration = sessionsWithDuration.length > 0
      ? sessionsWithDuration.reduce((sum, s) => sum + (s.duration || 0), 0) / sessionsWithDuration.length
      : 0;

    // Calculate average completion rate
    const sessionsWithCompletionRate = questionnaireSessions.filter(
      s => s.completionRate !== undefined
    );
    const averageCompletionRate = sessionsWithCompletionRate.length > 0
      ? sessionsWithCompletionRate.reduce((sum, s) => sum + (s.completionRate || 0), 0) / sessionsWithCompletionRate.length
      : (totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0);

    // Calculate popular voices
    const popularVoices: Record<string, number> = {};
    questionnaireSessions.forEach(s => {
      if (s.voiceId) {
        popularVoices[s.voiceId] = (popularVoices[s.voiceId] || 0) + 1;
      }
    });

    // Calculate peak usage hours
    const peakUsageHours: Record<string, number> = {};
    questionnaireSessions.forEach(s => {
      if (s.startTime) {
        const hour = new Date(s.startTime).getUTCHours().toString().padStart(2, '0');
        peakUsageHours[hour] = (peakUsageHours[hour] || 0) + 1;
      }
    });

    // Create analytics record
    const analytics: AnalyticsRecord = {
      date,
      questionnaireId,
      totalSessions,
      completedSessions,
      averageDuration: Math.round(averageDuration),
      averageCompletionRate: Math.round(averageCompletionRate * 100) / 100,
      popularVoices,
      peakUsageHours,
    };

    // Save to database
    await this.saveAnalytics(analytics);

    logger.info('Analytics computed and stored', {
      date,
      questionnaireId,
      totalSessions,
      completedSessions,
      averageDuration: analytics.averageDuration,
      averageCompletionRate: analytics.averageCompletionRate,
    });

    return analytics;
  }

  /**
   * Calculate day-over-day and week-over-week trends
   * 
   * Requirements:
   * - REQ-DATA-005: Calculate trends (day-over-day, week-over-week)
   */
  async calculateTrends(
    date: string,
    questionnaireId: string,
    continueOnFailure = false
  ): Promise<AnalyticsTrend | null> {
    const result = await withDatabaseErrorHandling(
      async () => {
        // Get current day analytics
        const current = await this.getAnalytics(date, questionnaireId);
        if (!current) {
          return null;
        }

        // Get previous day analytics
        const previousDay = new Date(date);
        previousDay.setDate(previousDay.getDate() - 1);
        const previousDayStr = previousDay.toISOString().split('T')[0];
        const previous = await this.getAnalytics(previousDayStr, questionnaireId);

        // Get week ago analytics
        const weekAgo = new Date(date);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];
        const weekAgoPrevious = await this.getAnalytics(weekAgoStr, questionnaireId);

        // Calculate trends
        const trend: AnalyticsTrend = {
          date,
          questionnaireId,
          totalSessions: current.totalSessions,
          completedSessions: current.completedSessions,
          completionRate: current.totalSessions > 0
            ? (current.completedSessions / current.totalSessions) * 100
            : 0,
          averageDuration: current.averageDuration,
        };

        // Day-over-day change
        if (previous) {
          trend.dayOverDayChange = {
            totalSessions: this.calculatePercentageChange(
              previous.totalSessions,
              current.totalSessions
            ),
            completedSessions: this.calculatePercentageChange(
              previous.completedSessions,
              current.completedSessions
            ),
            completionRate: this.calculatePercentageChange(
              previous.averageCompletionRate,
              current.averageCompletionRate
            ),
            averageDuration: this.calculatePercentageChange(
              previous.averageDuration,
              current.averageDuration
            ),
          };
        }

        // Week-over-week change
        if (weekAgoPrevious) {
          trend.weekOverWeekChange = {
            totalSessions: this.calculatePercentageChange(
              weekAgoPrevious.totalSessions,
              current.totalSessions
            ),
            completedSessions: this.calculatePercentageChange(
              weekAgoPrevious.completedSessions,
              current.completedSessions
            ),
            completionRate: this.calculatePercentageChange(
              weekAgoPrevious.averageCompletionRate,
              current.averageCompletionRate
            ),
            averageDuration: this.calculatePercentageChange(
              weekAgoPrevious.averageDuration,
              current.averageDuration
            ),
          };
        }

        logger.info('Trends calculated', {
          date,
          questionnaireId,
          hasDayOverDay: !!trend.dayOverDayChange,
          hasWeekOverWeek: !!trend.weekOverWeekChange,
        });

        return trend;
      },
      {
        operationName: 'calculateTrends',
        continueOnFailure,
      }
    );

    return result;
  }

  /**
   * Calculate percentage change between two values
   */
  private calculatePercentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) {
      return newValue > 0 ? 100 : 0;
    }
    return Math.round(((newValue - oldValue) / oldValue) * 100 * 100) / 100;
  }
}

// Singleton instance
let repositoryInstance: AnalyticsRepository | null = null;

/**
 * Get singleton analytics repository instance
 */
export function getAnalyticsRepository(): AnalyticsRepository {
  if (!repositoryInstance) {
    repositoryInstance = new AnalyticsRepository();
  }
  return repositoryInstance;
}
