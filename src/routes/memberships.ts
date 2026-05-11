import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticate);

const membershipSchema = z.object({
  memberId: z.number().int(),
  planId: z.number().int(),
  startDate: z.string(),
  totalAmount: z.number().positive(),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: z.string(),
  paymentMode: z.number().int().min(1).max(3),
  referenceNo: z.string().optional(),
});

function calculateEndDate(startDate: Date, durationValue: number, durationUnit: number): Date {
  const end = new Date(startDate);
  if (durationUnit === 1) end.setDate(end.getDate() + durationValue);
  else if (durationUnit === 2) end.setDate(end.getDate() + durationValue * 7);
  else if (durationUnit === 3) end.setMonth(end.getMonth() + durationValue);
  return end;
}

router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const memberships = await prisma.memberMembership.findMany({
    include: {
      member: { select: { id: true, memberNo: true, firstName: true, lastName: true } },
      plan: true,
      payments: true,
    },
    orderBy: { id: 'desc' },
  });
  res.json(memberships);
});

router.get('/member/:memberId', async (req: AuthRequest, res: Response) => {
  const memberId = parseInt(req.params.memberId as string);
  if (req.user?.role === 'member' && req.user.memberId !== memberId) {
    res.status(403).json({ message: 'Forbidden' }); return;
  }
  const memberships = await prisma.memberMembership.findMany({
    where: { memberId },
    include: { plan: true, payments: true },
    orderBy: { startDate: 'desc' },
  });
  res.json(memberships);
});

router.post('/calculate-end-date', authenticate, async (req: AuthRequest, res: Response) => {
  const { startDate, planId } = req.body;
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan) { res.status(404).json({ message: 'Plan not found' }); return; }
  const endDate = calculateEndDate(new Date(startDate), plan.durationValue, plan.durationUnit);
  res.json({ endDate });
});

router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = membershipSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors }); return; }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan) { res.status(404).json({ message: 'Plan not found' }); return; }

  const startDate = new Date(parsed.data.startDate);
  const endDate = calculateEndDate(startDate, plan.durationValue, plan.durationUnit);

  const membership = await prisma.memberMembership.create({
    data: {
      memberId: parsed.data.memberId,
      planId: parsed.data.planId,
      startDate,
      endDate,
      totalAmount: parsed.data.totalAmount,
    },
    include: { plan: true, payments: true },
  });
  res.status(201).json(membership);
});

router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const parsed = membershipSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors }); return; }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan) { res.status(404).json({ message: 'Plan not found' }); return; }

  const startDate = new Date(parsed.data.startDate);
  const endDate = calculateEndDate(startDate, plan.durationValue, plan.durationUnit);

  const membership = await prisma.memberMembership.update({
    where: { id },
    data: { ...parsed.data, startDate, endDate },
    include: { plan: true, payments: true },
  });
  res.json(membership);
});

router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.memberMembership.delete({ where: { id: parseInt(req.params.id as string) } });
  res.json({ message: 'Membership deleted' });
});

router.post('/:id/payments', requireAdmin, async (req: AuthRequest, res: Response) => {
  const membershipId = parseInt(req.params.id as string);
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors }); return; }

  const membership = await prisma.memberMembership.findUnique({
    where: { id: membershipId },
    include: { payments: true },
  });
  if (!membership) { res.status(404).json({ message: 'Membership not found' }); return; }

  const totalPaid = membership.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(membership.totalAmount) - totalPaid;
  if (parsed.data.amount > remaining + 0.01) {
    res.status(400).json({ message: `Amount exceeds balance of ${remaining.toFixed(2)}` }); return;
  }

  const payment = await prisma.membershipPayment.create({
    data: {
      membershipId,
      amount: parsed.data.amount,
      paymentDate: new Date(parsed.data.paymentDate),
      paymentMode: parsed.data.paymentMode,
      referenceNo: parsed.data.referenceNo,
    },
  });
  res.status(201).json(payment);
});

router.get('/:id/payments', authenticate, async (req: AuthRequest, res: Response) => {
  const payments = await prisma.membershipPayment.findMany({
    where: { membershipId: parseInt(req.params.id as string) },
    orderBy: { paymentDate: 'desc' },
  });
  res.json(payments);
});

export default router;
