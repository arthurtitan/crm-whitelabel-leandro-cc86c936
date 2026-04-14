import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const campaignService = {
  async list(accountId: string) {
    return prisma.emailCampaign.findMany({
      where: { accountId },
      include: {
        cadences: {
          include: { steps: { orderBy: { ordem: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async get(id: string, accountId: string) {
    return prisma.emailCampaign.findFirst({
      where: { id, accountId },
      include: {
        cadences: {
          include: {
            steps: { orderBy: { ordem: 'asc' } },
            enrollments: { select: { id: true, status: true } },
          },
        },
      },
    });
  },

  async create(data: { accountId: string; name: string; description?: string; createdBy?: string }) {
    return prisma.emailCampaign.create({ data });
  },

  async update(id: string, accountId: string, data: { name?: string; description?: string; active?: boolean }) {
    return prisma.emailCampaign.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    // Unlink cadences first
    await prisma.emailCadence.updateMany({
      where: { campaignId: id },
      data: { campaignId: null },
    });
    return prisma.emailCampaign.delete({ where: { id } });
  },

  async addCadence(campaignId: string, cadenceId: string) {
    return prisma.emailCadence.update({
      where: { id: cadenceId },
      data: { campaignId },
    });
  },

  async removeCadence(cadenceId: string) {
    return prisma.emailCadence.update({
      where: { id: cadenceId },
      data: { campaignId: null },
    });
  },

  async getStats(campaignId: string) {
    const cadences = await prisma.emailCadence.findMany({
      where: { campaignId },
      select: { id: true },
    });
    const cadenceIds = cadences.map(c => c.id);
    if (cadenceIds.length === 0) return { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, enrollments: 0 };

    const [total, sent, delivered, opened, clicked, bounced, failed, enrollments] = await Promise.all([
      prisma.emailSend.count({ where: { enrollment: { cadenceId: { in: cadenceIds } } } }),
      prisma.emailSend.count({ where: { enrollment: { cadenceId: { in: cadenceIds } }, status: 'sent' } }),
      prisma.emailSend.count({ where: { enrollment: { cadenceId: { in: cadenceIds } }, status: 'delivered' } }),
      prisma.emailSend.count({ where: { enrollment: { cadenceId: { in: cadenceIds } }, status: 'opened' } }),
      prisma.emailSend.count({ where: { enrollment: { cadenceId: { in: cadenceIds } }, status: 'clicked' } }),
      prisma.emailSend.count({ where: { enrollment: { cadenceId: { in: cadenceIds } }, status: 'bounced' } }),
      prisma.emailSend.count({ where: { enrollment: { cadenceId: { in: cadenceIds } }, status: 'failed' } }),
      prisma.emailEnrollment.count({ where: { cadenceId: { in: cadenceIds } } }),
    ]);

    return { total, sent, delivered, opened, clicked, bounced, failed, enrollments };
  },
};
