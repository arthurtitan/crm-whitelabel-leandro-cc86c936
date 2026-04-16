import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureAudienceBelongsToAccount(audienceId: string | null | undefined, accountId: string) {
  if (!audienceId) return;

  const audience = await prisma.emailAudience.findFirst({
    where: { id: audienceId, accountId },
    select: { id: true },
  });

  if (!audience) {
    throw new Error('Público não encontrado para esta conta');
  }
}

async function ensureCampaignBelongsToAccount(id: string, accountId: string) {
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id, accountId },
    select: { id: true },
  });

  if (!campaign) {
    throw new Error('Campanha não encontrada');
  }
}

export const campaignService = {
  async list(accountId: string) {
    return prisma.emailCampaign.findMany({
      where: { accountId },
      include: {
        audience: { select: { id: true, name: true } },
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
        audience: { select: { id: true, name: true } },
        cadences: {
          include: {
            steps: { orderBy: { ordem: 'asc' } },
            enrollments: { select: { id: true, status: true } },
          },
        },
      },
    });
  },

  async create(data: { accountId: string; name: string; description?: string; createdBy?: string; audienceId?: string | null }) {
    await ensureAudienceBelongsToAccount(data.audienceId, data.accountId);

    return prisma.emailCampaign.create({
      data: {
        accountId: data.accountId,
        name: data.name,
        description: data.description,
        createdBy: data.createdBy,
        audienceId: data.audienceId ?? null,
      },
      include: {
        audience: { select: { id: true, name: true } },
        cadences: { include: { steps: { orderBy: { ordem: 'asc' } } } },
      },
    });
  },

  async update(id: string, accountId: string, data: { name?: string; description?: string; active?: boolean; audienceId?: string | null }) {
    await ensureCampaignBelongsToAccount(id, accountId);
    await ensureAudienceBelongsToAccount(data.audienceId, accountId);

    return prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.audienceId !== undefined && { audienceId: data.audienceId }),
      },
      include: {
        audience: { select: { id: true, name: true } },
        cadences: { include: { steps: { orderBy: { ordem: 'asc' } } } },
      },
    });
  },

  async delete(id: string, accountId: string) {
    await ensureCampaignBelongsToAccount(id, accountId);

    // Unlink cadences first
    await prisma.emailCadence.updateMany({
      where: { campaignId: id, accountId },
      data: { campaignId: null },
    });

    return prisma.emailCampaign.delete({ where: { id } });
  },

  async addCadence(campaignId: string, cadenceId: string, accountId: string) {
    await ensureCampaignBelongsToAccount(campaignId, accountId);

    const cadence = await prisma.emailCadence.findFirst({
      where: { id: cadenceId, accountId },
      select: { id: true },
    });

    if (!cadence) {
      throw new Error('Cadência não encontrada');
    }

    return prisma.emailCadence.update({
      where: { id: cadenceId },
      data: { campaignId },
    });
  },

  async removeCadence(campaignId: string, cadenceId: string, accountId: string) {
    await ensureCampaignBelongsToAccount(campaignId, accountId);

    const cadence = await prisma.emailCadence.findFirst({
      where: { id: cadenceId, accountId, campaignId },
      select: { id: true },
    });

    if (!cadence) {
      throw new Error('Cadência não encontrada');
    }

    return prisma.emailCadence.update({
      where: { id: cadenceId },
      data: { campaignId: null },
    });
  },

  async getStats(campaignId: string, accountId: string) {
    await ensureCampaignBelongsToAccount(campaignId, accountId);

    const cadences = await prisma.emailCadence.findMany({
      where: { campaignId, accountId },
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
