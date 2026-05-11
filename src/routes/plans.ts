import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticate);

const planSchema = z.object({
  name: z.string().min(1),
  durationValue: z.number().int().positive(),
  durationUnit: z.number().int().min(1).max(3),
  price: z.number().positive(),
  description: z.string().optional(),
  businessId: z.number().optional(),
});

router.get('/', async (_req: AuthRequest, res: Response) => {
  const plans = await prisma.membershipPlan.findMany({ orderBy: { id: 'desc' } });
  res.json(plans);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: parseInt(req.params.id as string) } });
  if (!plan) { res.status(404).json({ message: 'Plan not found' }); return; }
  res.json(plan);
});

router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors }); return; }
  const plan = await prisma.membershipPlan.create({ data: { ...parsed.data, price: parsed.data.price } });
  res.status(201).json(plan);
});

router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors }); return; }
  const plan = await prisma.membershipPlan.update({ where: { id: parseInt(req.params.id as string) }, data: parsed.data });
  res.json(plan);
});

router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.membershipPlan.delete({ where: { id: parseInt(req.params.id as string) } });
  res.json({ message: 'Plan deleted' });
});

export default router;
