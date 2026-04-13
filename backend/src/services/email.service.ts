import { PrismaClient } from '@prisma/client';
import { sendgridService } from './sendgrid.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Utility: delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate nextSendAt based on startDate, dayNumber, and sendAtTime (HH:MM).
 * Day 1 = startDate, Day 2 = startDate + 1 day, etc.
 * If the calculated date+time is in the past, returns the date anyway (processor will send immediately).
 */
function calculateNextSendAt(dayNumber: number, sendAtTime: string, timezone: string = 'America/Sao_Paulo', startDate?: Date | string): Date {
  const [hours, minutes] = (sendAtTime || '09:00').split(':').map(Number);

  // Base date: use startDate if provided, otherwise today
  const base = startDate ? new Date(startDate) : new Date();
  
  // Day 1 = base date, Day 2 = base + 1, etc.
  const daysOffset = Math.max(0, dayNumber - 1);
  
  const targetDate = new Date(base);
  targetDate.setDate(targetDate.getDate() + daysOffset);
  
  // Use Intl to get current timezone offset for targetDate
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = formatter.formatToParts(targetDate);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
  
  const currentLocalHour = parseInt(getPart('hour'));
  const currentLocalMinute = parseInt(getPart('minute'));
  const hourDiff = hours - currentLocalHour;
  const minuteDiff = minutes - currentLocalMinute;
  
  const result = new Date(targetDate);
  result.setHours(result.getHours() + hourDiff);
  result.setMinutes(result.getMinutes() + minuteDiff);
  result.setSeconds(0);
  result.setMilliseconds(0);
  
  return result;
}

// Utility: exponential backoff
async function withBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const is429 = error?.status === 429 || error?.message?.includes('429');
      if (!is429 || attempt === maxRetries) throw error;
      const waitMs = baseDelayMs * Math.pow(2, attempt);
      logger.warn(`[EmailProcessor] Rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await delay(waitMs);
    }
  }
  throw new Error('Unreachable');
}

export const emailService = {
  // ==================== CADENCES ====================

  async listCadences(accountId: string) {
    return prisma.emailCadence.findMany({
      where: { accountId },
      include: {
        steps: { orderBy: { ordem: 'asc' } },
        rulesFrom: { include: { targetCadence: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getCadence(id: string, accountId: string) {
    return prisma.emailCadence.findFirst({
      where: { id, accountId },
      include: {
        steps: { orderBy: { ordem: 'asc' } },
        enrollments: { include: { contact: true } },
        rulesFrom: { include: { targetCadence: { select: { id: true, name: true } } } },
      },
    });
  },

  async createCadence(data: {
    accountId: string;
    name: string;
    description?: string;
    targetStageIds?: string[];
    createdBy?: string;
  }) {
    return prisma.emailCadence.create({
      data: {
        accountId: data.accountId,
        name: data.name,
        description: data.description,
        targetStageIds: data.targetStageIds || [],
        createdBy: data.createdBy,
      },
      include: { steps: true },
    });
  },

  async updateCadence(id: string, accountId: string, data: {
    name?: string;
    description?: string;
    targetStageIds?: string[];
    active?: boolean;
  }) {
    return prisma.emailCadence.update({
      where: { id },
      data,
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  },

  async deleteCadence(id: string, accountId: string) {
    return prisma.emailCadence.delete({ where: { id } });
  },

  // ==================== CADENCE RULES ====================

  async listRules(cadenceId: string) {
    return prisma.emailCadenceRule.findMany({
      where: { cadenceId },
      include: { targetCadence: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async createRule(data: {
    cadenceId: string;
    triggerEvent: string;
    targetCadenceId: string;
    delayHours?: number;
  }) {
    return prisma.emailCadenceRule.create({
      data: {
        cadenceId: data.cadenceId,
        triggerEvent: data.triggerEvent,
        targetCadenceId: data.targetCadenceId,
        delayHours: data.delayHours || 0,
      },
      include: { targetCadence: { select: { id: true, name: true } } },
    });
  },

  async updateRule(id: string, data: {
    triggerEvent?: string;
    targetCadenceId?: string;
    delayHours?: number;
    active?: boolean;
  }) {
    return prisma.emailCadenceRule.update({
      where: { id },
      data,
      include: { targetCadence: { select: { id: true, name: true } } },
    });
  },

  async deleteRule(id: string) {
    return prisma.emailCadenceRule.delete({ where: { id } });
  },

  // ==================== STEPS ====================

  async createStep(cadenceId: string, data: {
    dayNumber: number;
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    ordem?: number;
  }) {
    return prisma.emailCadenceStep.create({
      data: {
        cadenceId,
        dayNumber: data.dayNumber,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        ordem: data.ordem || 0,
      },
    });
  },

  async updateStep(id: string, data: {
    dayNumber?: number;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
    active?: boolean;
    ordem?: number;
  }) {
    return prisma.emailCadenceStep.update({ where: { id }, data });
  },

  async deleteStep(id: string) {
    return prisma.emailCadenceStep.delete({ where: { id } });
  },

  // ==================== TEMPLATES ====================

  async listTemplates(accountId: string) {
    return prisma.emailTemplate.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createTemplate(data: {
    accountId: string;
    name: string;
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    category?: string;
    createdBy?: string;
  }) {
    return prisma.emailTemplate.create({ data });
  },

  async updateTemplate(id: string, data: {
    name?: string;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
    category?: string;
  }) {
    return prisma.emailTemplate.update({ where: { id }, data });
  },

  async deleteTemplate(id: string) {
    return prisma.emailTemplate.delete({ where: { id } });
  },

  // ==================== ENROLLMENTS ====================

  async enrollContacts(data: {
    accountId: string;
    cadenceId: string;
    contactIds: string[];
  }) {
    const cadence = await prisma.emailCadence.findUnique({
      where: { id: data.cadenceId },
      include: { steps: { orderBy: { ordem: 'asc' }, take: 1 }, account: { select: { timezone: true } } },
    });

    if (!cadence) throw new Error('Cadência não encontrada');

    const firstStep = cadence.steps[0];
    const timezone = cadence.account?.timezone || 'America/Sao_Paulo';
    const nextSendAt = firstStep
      ? calculateNextSendAt(firstStep.dayNumber, cadence.sendAtTime, timezone)
      : null;

    const enrollments = await Promise.all(
      data.contactIds.map(async (contactId) => {
        const existing = await prisma.emailEnrollment.findFirst({
          where: {
            cadenceId: data.cadenceId,
            contactId,
            status: 'active',
          },
        });
        if (existing) return existing;

        return prisma.emailEnrollment.create({
          data: {
            accountId: data.accountId,
            cadenceId: data.cadenceId,
            contactId,
            nextSendAt,
          },
        });
      })
    );

    return enrollments;
  },

  async unenrollContacts(cadenceId: string, contactIds: string[]) {
    return prisma.emailEnrollment.updateMany({
      where: {
        cadenceId,
        contactId: { in: contactIds },
        status: 'active',
      },
      data: { status: 'paused' },
    });
  },

  async listEnrollments(accountId: string, cadenceId?: string) {
    return prisma.emailEnrollment.findMany({
      where: {
        accountId,
        ...(cadenceId ? { cadenceId } : {}),
      },
      include: { contact: true, cadence: true },
      orderBy: { enrolledAt: 'desc' },
    });
  },

  // ==================== SENDS ====================

  async listSends(accountId: string, filters?: {
    cadenceId?: string;
    contactId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { accountId };
    if (filters?.contactId) where.contactId = filters.contactId;
    if (filters?.status) where.status = filters.status;
    if (filters?.cadenceId) {
      where.enrollment = { cadenceId: filters.cadenceId };
    }

    return prisma.emailSend.findMany({
      where,
      include: { contact: true, step: true },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });
  },

  async getSendStats(accountId: string) {
    const [total, sent, delivered, opened, clicked, bounced, failed] = await Promise.all([
      prisma.emailSend.count({ where: { accountId } }),
      prisma.emailSend.count({ where: { accountId, status: 'sent' } }),
      prisma.emailSend.count({ where: { accountId, status: 'delivered' } }),
      prisma.emailSend.count({ where: { accountId, status: 'opened' } }),
      prisma.emailSend.count({ where: { accountId, status: 'clicked' } }),
      prisma.emailSend.count({ where: { accountId, status: 'bounced' } }),
      prisma.emailSend.count({ where: { accountId, status: 'failed' } }),
    ]);

    return { total, sent, delivered, opened, clicked, bounced, failed };
  },

  // ==================== CADENCE PROCESSOR (with rate limiting) ====================

  async processCadenceQueue() {
    const now = new Date();

    // Find active enrollments ready to send
    const readyEnrollments = await prisma.emailEnrollment.findMany({
      where: {
        status: 'active',
        nextSendAt: { lte: now },
      },
      include: {
        cadence: {
          include: {
            steps: { orderBy: { ordem: 'asc' } },
            rulesFrom: { where: { active: true } },
          },
        },
        contact: true,
      },
      take: 100, // Global batch limit
    });

    logger.info(`[EmailProcessor] Found ${readyEnrollments.length} enrollments to process`);

    // Group by account for rate limiting
    const byAccount = new Map<string, typeof readyEnrollments>();
    for (const enrollment of readyEnrollments) {
      const list = byAccount.get(enrollment.accountId) || [];
      list.push(enrollment);
      byAccount.set(enrollment.accountId, list);
    }

    let totalProcessed = 0;

    for (const [accountId, enrollments] of byAccount) {
      // Get account-specific rate limit config
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: {
          emailBatchSize: true,
          emailDelayMs: true,
          sendgridApiKey: true,
          sendgridFromEmail: true,
          sendgridFromName: true,
        },
      });

      if (!account?.sendgridApiKey || !account?.sendgridFromEmail) {
        logger.warn(`[EmailProcessor] No SendGrid credentials for account ${accountId}`);
        continue;
      }

      const batchSize = account.emailBatchSize || 100;
      const delayMs = account.emailDelayMs || 500;
      const creds = {
        apiKey: account.sendgridApiKey,
        fromEmail: account.sendgridFromEmail,
        fromName: account.sendgridFromName || 'GoodLeads CRM',
      };

      const batch = enrollments.slice(0, batchSize);

      for (const enrollment of batch) {
        try {
          const steps = enrollment.cadence.steps.filter(s => s.active);
          const currentStep = steps[enrollment.currentStep];

          if (!currentStep || !enrollment.contact.email) {
            await prisma.emailEnrollment.update({
              where: { id: enrollment.id },
              data: { status: 'completed', completedAt: now },
            });
            continue;
          }

          // Replace variables
          const replacements: Record<string, string> = {
            '{nome}': enrollment.contact.nome || '',
            '{email}': enrollment.contact.email || '',
          };

          let subject = currentStep.subject;
          let bodyHtml = currentStep.bodyHtml;
          for (const [key, val] of Object.entries(replacements)) {
            subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
            bodyHtml = bodyHtml.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
          }

          // Create send record
          const emailSend = await prisma.emailSend.create({
            data: {
              accountId: enrollment.accountId,
              enrollmentId: enrollment.id,
              stepId: currentStep.id,
              contactId: enrollment.contactId,
              toEmail: enrollment.contact.email,
              subject,
              status: 'queued',
            },
          });

          // Send with exponential backoff on 429
          const result = await withBackoff(() =>
            sendgridService.sendEmail({
              to: enrollment.contact.email!,
              subject,
              html: bodyHtml,
              text: currentStep.bodyText || undefined,
              fromEmail: creds.fromEmail,
              fromName: creds.fromName,
              apiKey: creds.apiKey,
            })
          );

          if (result.success) {
            await prisma.emailSend.update({
              where: { id: emailSend.id },
              data: {
                status: 'sent',
                sentAt: now,
                sendgridMessageId: result.messageId,
              },
            });

            // Advance to next step
            const nextStepIndex = enrollment.currentStep + 1;
            const nextStep = steps[nextStepIndex];

            if (nextStep) {
              const timezone = (await prisma.account.findUnique({ where: { id: enrollment.accountId }, select: { timezone: true } }))?.timezone || 'America/Sao_Paulo';
              const nextSendAt = calculateNextSendAt(nextStep.dayNumber, enrollment.cadence.sendAtTime, timezone);
              await prisma.emailEnrollment.update({
                where: { id: enrollment.id },
                data: { currentStep: nextStepIndex, nextSendAt },
              });
            } else {
              await prisma.emailEnrollment.update({
                where: { id: enrollment.id },
                data: { status: 'completed', completedAt: now },
              });
            }

            totalProcessed++;
          } else {
            await prisma.emailSend.update({
              where: { id: emailSend.id },
              data: { status: 'failed', errorMessage: result.error },
            });
          }

          // Rate limit delay between sends
          await delay(delayMs);
        } catch (error: any) {
          logger.error(`[EmailProcessor] Error processing enrollment ${enrollment.id}: ${error.message}`);
        }
      }
    }

    // Process branching rules based on webhook events
    await this.processBranchingRules();

    return totalProcessed;
  },

  // ==================== BRANCHING RULES PROCESSOR ====================

  async processBranchingRules() {
    try {
      // Find recently completed/updated sends with events
      const recentSends = await prisma.emailSend.findMany({
        where: {
          OR: [
            { status: 'opened', openedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
            { status: 'clicked', clickedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
            { status: 'bounced', bouncedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
          ],
          enrollmentId: { not: null },
        },
        include: {
          enrollment: {
            include: {
              cadence: {
                include: { rulesFrom: { where: { active: true } } },
              },
            },
          },
        },
        take: 100,
      });

      for (const send of recentSends) {
        if (!send.enrollment?.cadence?.rulesFrom?.length) continue;

        // Map send status to trigger event
        let triggerEvent: string | null = null;
        if (send.status === 'clicked') triggerEvent = 'clicked';
        else if (send.status === 'opened') triggerEvent = 'opened';
        else if (send.status === 'bounced') triggerEvent = 'bounced';

        if (!triggerEvent) continue;

        // Find matching rule (priority: clicked > opened > bounced)
        const matchingRule = send.enrollment.cadence.rulesFrom.find(
          r => r.triggerEvent === triggerEvent
        );

        if (!matchingRule) continue;

        // Check if already enrolled in target cadence
        const existingEnrollment = await prisma.emailEnrollment.findFirst({
          where: {
            cadenceId: matchingRule.targetCadenceId,
            contactId: send.enrollment.contactId,
            status: 'active',
          },
        });

        if (existingEnrollment) continue;

        // Complete current enrollment
        await prisma.emailEnrollment.update({
          where: { id: send.enrollmentId! },
          data: { status: 'completed', completedAt: new Date() },
        });

        // Create new enrollment in target cadence
        const delayMs = matchingRule.delayHours * 60 * 60 * 1000;
        await prisma.emailEnrollment.create({
          data: {
            accountId: send.accountId,
            cadenceId: matchingRule.targetCadenceId,
            contactId: send.enrollment.contactId,
            nextSendAt: new Date(Date.now() + delayMs),
          },
        });

        logger.info(`[Branching] Contact ${send.enrollment.contactId} moved to cadence ${matchingRule.targetCadenceId} (trigger: ${triggerEvent})`);
      }
    } catch (error: any) {
      logger.error(`[Branching] Error processing rules: ${error.message}`);
    }
  },
};
