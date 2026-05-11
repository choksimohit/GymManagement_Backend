import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/memberships', async (req: AuthRequest, res: Response) => {
  const memberships = await prisma.memberMembership.findMany({
    include: {
      member: { select: { firstName: true, lastName: true, memberNo: true } },
      plan: { select: { name: true } },
      payments: true,
    },
    orderBy: { startDate: 'desc' },
  });

  const now = new Date();
  const rows = memberships.map(m => {
    const paid = m.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(m.totalAmount) - paid;
    const isExpired = new Date(m.endDate) < now;
    const isDue = balance > 0;
    const status = isExpired ? 'Expired' : isDue ? 'Due' : 'Active';
    return {
      memberName: `${m.member.firstName} ${m.member.lastName}`,
      memberNo: m.member.memberNo,
      planName: m.plan.name,
      startDate: m.startDate,
      endDate: m.endDate,
      totalAmount: Number(m.totalAmount),
      paid,
      balance,
      status,
    };
  });

  const summary = {
    active: rows.filter(r => r.status === 'Active').length,
    due: rows.filter(r => r.status === 'Due').length,
    expired: rows.filter(r => r.status === 'Expired').length,
  };

  res.json({ summary, rows });
});

router.get('/memberships/csv', async (req: AuthRequest, res: Response) => {
  const memberships = await prisma.memberMembership.findMany({
    include: {
      member: { select: { firstName: true, lastName: true, memberNo: true } },
      plan: { select: { name: true } },
      payments: true,
    },
    orderBy: { startDate: 'desc' },
  });

  const now = new Date();
  const rows = memberships.map(m => {
    const paid = m.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(m.totalAmount) - paid;
    const isExpired = new Date(m.endDate) < now;
    const status = isExpired ? 'Expired' : balance > 0 ? 'Due' : 'Active';
    return [
      `${m.member.firstName} ${m.member.lastName}`,
      m.member.memberNo,
      m.plan.name,
      m.startDate.toISOString().slice(0, 10),
      m.endDate.toISOString().slice(0, 10),
      Number(m.totalAmount).toFixed(2),
      paid.toFixed(2),
      balance.toFixed(2),
      status,
    ].join(',');
  });

  const csv = ['Member Name,Member No,Plan,Start Date,End Date,Total,Paid,Balance,Status', ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="memberships.csv"');
  res.send(csv);
});

router.get('/revenue', async (req: AuthRequest, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const payments = await prisma.membershipPayment.findMany({
    where: { paymentDate: { gte: start, lte: end } },
    include: {
      membership: {
        include: { member: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { paymentDate: 'asc' },
  });

  const byDay: Record<string, { date: string; total: number; payments: unknown[] }> = {};
  for (const p of payments) {
    const key = p.paymentDate.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = { date: key, total: 0, payments: [] };
    byDay[key].total += Number(p.amount);
    byDay[key].payments.push({
      member: `${p.membership.member.firstName} ${p.membership.member.lastName}`,
      amount: Number(p.amount),
      paymentMode: p.paymentMode,
    });
  }

  const days = Object.values(byDay);
  const grandTotal = days.reduce((s, d) => s + d.total, 0);

  res.json({ year, month, grandTotal, days });
});

export default router;
