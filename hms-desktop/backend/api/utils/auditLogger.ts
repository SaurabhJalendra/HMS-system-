import { PrismaClient } from '@prisma/client';
import { getHospitalId } from './hospitalHelper';
import logger, { logAction } from './logger';

const prisma = new PrismaClient();

export interface AuditLogData {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: any;
  oldValue?: any;
}

/**
 * Create an audit log entry
 * Automatically includes hospitalId from hospital configuration
 */
export const createAuditLog = async (data: AuditLogData) => {
  try {
    const hospitalId = await getHospitalId();
    if (!hospitalId) {
      logger.warn('Cannot create audit log: Hospital ID not found', { context: 'Audit' });
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        hospitalId: hospitalId,
        action: data.action,
        tableName: data.entityType,
        recordId: data.entityId,
        oldValue: data.oldValue,
        newValue: data.details,
      },
    });

    logAction(`Audit: ${data.action} on ${data.entityType}`, {
      userId: data.userId,
      action: data.action,
      tableName: data.entityType,
      recordId: data.entityId,
    });
  } catch (error) {
    logger.error('Failed to create audit log', error instanceof Error ? error : undefined, {
      context: 'Audit',
      action: data.action,
      entityType: data.entityType,
    });
    // Don't throw error to avoid breaking the main operation
  }
};

/**
 * Helper function to create audit log with all required fields
 * Use this instead of direct prisma.auditLog.create() calls
 */
export const logAudit = async (params: {
  userId: string;
  action: string;
  tableName: string;
  recordId: string;
  oldValue?: any;
  newValue?: any;
}) => {
  try {
    const hospitalId = await getHospitalId();
    if (!hospitalId) {
      logger.warn('Cannot create audit log: Hospital ID not found', { context: 'Audit' });
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        hospitalId: hospitalId,
        action: params.action,
        tableName: params.tableName,
        recordId: params.recordId,
        oldValue: params.oldValue ? JSON.parse(JSON.stringify(params.oldValue)) : null,
        newValue: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : null,
      },
    });

    logAction(`Audit: ${params.action} on ${params.tableName}`, {
      userId: params.userId,
      action: params.action,
      tableName: params.tableName,
      recordId: params.recordId,
    });
  } catch (error) {
    logger.error('Failed to create audit log', error instanceof Error ? error : undefined, {
      context: 'Audit',
      action: params.action,
      tableName: params.tableName,
    });
    // Don't throw error to avoid breaking the main operation
  }
};
