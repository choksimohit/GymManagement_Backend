import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticate);

router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const in7Days = new Date(now); in7Days.setDate(in7Days.getDate() + 7);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const [
    totalMembers,
    activeMembers,
    todayAttendance,
    expiringIn7Days,
    monthlyRevenue,
    activeSubscriptions,
  ] = await Promise.all([
    prisma.gymMember.count(),
    prisma.gymMember.count({ where: { membershipStatus: 1 } }),
    prisma.attendance.count({ where: { checkIn: { gte: todayStart, lte: todayEnd } } }),
    prisma.memberMembership.count({ where: { endDate: { gte: now, lte: in7Days } } }),
    prisma.membershipPayment.aggregate({
      _sum: { amount: true },
      where: { paymentDate: { gte: monthStart } },
    }),
    prisma.memberMembership.count({ where: { endDate: { gte: now } } }),
  ]);

  res.json({
    totalMembers,
    activeMembers,
    todayAttendance,
    expiringIn7Days,
    activeSubscriptions,
    monthlyRevenue: Number(monthlyRevenue._sum.amount ?? 0),
  });
});

export default router;
