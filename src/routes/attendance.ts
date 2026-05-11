import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticate);

router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const dateStr = req.query.date as string;
  const date = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);

  const records = await prisma.attendance.findMany({
    where: { checkIn: { gte: start, lte: end } },
    include: { member: { select: { id: true, memberNo: true, firstName: true, lastName: true } } },
    orderBy: { checkIn: 'desc' },
  });
  res.json(records);
});

router.post('/check-in', async (req: AuthRequest, res: Response) => {
  const memberId = req.body.memberId ?? req.user?.memberId;
  if (!memberId) { res.status(400).json({ message: 'memberId required' }); return; }

  if (req.user?.role === 'member' && req.user.memberId !== memberId) {
    res.status(403).json({ message: 'Forbidden' }); return;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.attendance.findFirst({
    where: { memberId, checkIn: { gte: today, lt: tomorrow } },
  });

  if (existing) {
    res.status(409).json({ message: 'Already checked in today', record: existing }); return;
  }

  const record = await prisma.attendance.create({
    data: { memberId, checkIn: new Date() },
  });
  res.status(201).json(record);
});

router.post('/check-out', async (req: AuthRequest, res: Response) => {
  const memberId = req.body.memberId ?? req.user?.memberId;
  if (!memberId) { res.status(400).json({ message: 'memberId required' }); return; }

  if (req.user?.role === 'member' && req.user.memberId !== memberId) {
    res.status(403).json({ message: 'Forbidden' }); return;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const record = await prisma.attendance.findFirst({
    where: { memberId, checkIn: { gte: today, lt: tomorrow }, checkOut: null },
  });

  if (!record) {
    res.status(404).json({ message: 'No active check-in found for today' }); return;
  }

  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: { checkOut: new Date() },
  });
  res.json(updated);
});

// QR-based check-in/out
router.post('/qr', async (req: AuthRequest, res: Response) => {
  const { qrCode } = req.body;
  if (!qrCode) { res.status(400).json({ message: 'qrCode required' }); return; }

  let decoded: string;
  try {
    decoded = Buffer.from(qrCode, 'base64').toString('utf8');
  } catch {
    res.status(400).json({ message: 'Invalid QR code' }); return;
  }

  // Expected format: GYMCARE|branchId|timestamp|secret
  const parts = decoded.split('|');
  if (parts.length !== 4 || parts[0] !== 'GYMCARE') {
    res.status(400).json({ message: 'Invalid QR format' }); return;
  }

  const timestamp = parseInt(parts[2]);
  const twoMinutes = 2 * 60 * 1000;
  if (Date.now() - timestamp > twoMinutes) {
    res.status(400).json({ message: 'QR code expired' }); return;
  }

  if (parts[3] !== process.env.QR_SECRET) {
    res.status(400).json({ message: 'Invalid QR secret' }); return;
  }

  const memberId = req.user?.memberId;
  if (!memberId) { res.status(401).json({ message: 'Member not identified' }); return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.attendance.findFirst({
    where: { memberId, checkIn: { gte: today, lt: tomorrow } },
  });

  if (!existing) {
    const record = await prisma.attendance.create({ data: { memberId, checkIn: new Date() } });
    res.json({ action: 'check-in', record }); return;
  }

  if (!existing.checkOut) {
    const record = await prisma.attendance.update({
      where: { id: existing.id },
      data: { checkOut: new Date() },
    });
    res.json({ action: 'check-out', record }); return;
  }

  res.json({ action: 'none', message: 'Already checked in and out today' });
});

export default router;
