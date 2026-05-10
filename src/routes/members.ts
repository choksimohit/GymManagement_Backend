import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

const memberSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  membershipType: z.number().int().min(1).max(3).default(1),
  membershipStatus: z.number().int().min(1).max(4).default(1),
  businessId: z.number().optional(),
  emergencyContacts: z.array(z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    relationship: z.string().optional(),
    phone: z.string().min(1),
  })).optional(),
});

async function generateMemberNo(): Promise<string> {
  const last = await prisma.gymMember.findFirst({ orderBy: { id: 'desc' } });
  const num = last ? last.id + 1 : 1;
  return `MBR-${String(num).padStart(5, '0')}`;
}

router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const members = await prisma.gymMember.findMany({
    include: {
      memberships: {
        include: { payments: true },
        orderBy: { endDate: 'desc' },
        take: 1,
      },
    },
    orderBy: { id: 'desc' },
  });

  const result = members.map(m => {
    const latest = m.memberships[0];
    const paid = latest?.payments.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
    const isPaymentActive = latest
      ? paid >= Number(latest.totalAmount) && new Date(latest.endDate) >= new Date()
      : false;
    return {
      id: m.id,
      memberNo: m.memberNo,
      fullName: `${m.firstName} ${m.lastName}`,
      phone: m.phone,
      email: m.email,
      membershipType: m.membershipType,
      membershipStatus: m.membershipStatus,
      joinDate: m.joinDate,
      isPaymentActive,
    };
  });

  res.json(result);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (req.user?.role === 'member' && req.user.memberId !== id) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }

  const member = await prisma.gymMember.findUnique({
    where: { id },
    include: {
      emergencyContacts: true,
      memberships: {
        include: { plan: true, payments: true },
        orderBy: { startDate: 'desc' },
      },
      bodyProgress: { orderBy: { progressDate: 'desc' } },
    },
  });

  if (!member) {
    res.status(404).json({ message: 'Member not found' });
    return;
  }

  res.json(member);
});

router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
    return;
  }

  const { emergencyContacts, ...data } = parsed.data;
  const memberNo = await generateMemberNo();

  const member = await prisma.$transaction(async tx => {
    const created = await tx.gymMember.create({
      data: {
        ...data,
        memberNo,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        emergencyContacts: emergencyContacts
          ? { create: emergencyContacts }
          : undefined,
      },
      include: { emergencyContacts: true },
    });

    if (data.email) {
      const existing = await tx.user.findUnique({ where: { email: data.email } });
      if (!existing) {
        const passwordHash = await bcrypt.hash('Gym@123', 10);
        await tx.user.create({
          data: { fullName: `${data.firstName} ${data.lastName}`, email: data.email, passwordHash },
        });
      }
    }

    return created;
  });

  res.status(201).json(member);
});

router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
    return;
  }

  const { emergencyContacts, ...data } = parsed.data;

  const member = await prisma.$transaction(async tx => {
    const updated = await tx.gymMember.update({
      where: { id },
      data: {
        ...data,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      },
    });

    if (emergencyContacts) {
      const incoming = emergencyContacts;
      const incomingIds = incoming.filter(c => c.id).map(c => c.id!);

      await tx.memberEmergencyContact.deleteMany({
        where: { memberId: id, id: { notIn: incomingIds } },
      });

      for (const contact of incoming) {
        if (contact.id) {
          await tx.memberEmergencyContact.update({
            where: { id: contact.id },
            data: { name: contact.name, relationship: contact.relationship, phone: contact.phone },
          });
        } else {
          await tx.memberEmergencyContact.create({
            data: { memberId: id, name: contact.name, relationship: contact.relationship, phone: contact.phone },
          });
        }
      }
    }

    return updated;
  });

  res.json(member);
});

router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  await prisma.gymMember.update({
    where: { id },
    data: { membershipStatus: 3 },
  });
  res.json({ message: 'Member resigned' });
});

export default router;
