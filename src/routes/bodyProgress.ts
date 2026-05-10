import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

const progressSchema = z.object({
  memberId: z.number().int(),
  progressDate: z.string(),
  weight: z.number().optional(),
  bmi: z.number().optional(),
  fat: z.number().optional(),
  muscle: z.number().optional(),
  notes: z.string().optional(),
});

router.get('/member/:memberId', async (req: AuthRequest, res: Response) => {
  const memberId = parseInt(req.params.memberId);
  if (req.user?.role === 'member' && req.user.memberId !== memberId) {
    res.status(403).json({ message: 'Forbidden' }); return;
  }
  const records = await prisma.bodyProgress.findMany({
    where: { memberId },
    orderBy: { progressDate: 'desc' },
  });
  res.json(records);
});

router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = progressSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors }); return; }
  const record = await prisma.bodyProgress.create({
    data: { ...parsed.data, progressDate: new Date(parsed.data.progressDate) },
  });
  res.status(201).json(record);
});

router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = progressSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors }); return; }
  const record = await prisma.bodyProgress.update({
    where: { id: parseInt(req.params.id) },
    data: { ...parsed.data, progressDate: new Date(parsed.data.progressDate) },
  });
  res.json(record);
});

router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.bodyProgress.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ message: 'Record deleted' });
});

export default router;
