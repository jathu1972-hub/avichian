import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { enableMfa, setupMfa } from '../services/auth.service.js';

const enableMfaSchema = z.object({
  code: z.string().length(6),
});

export const mfaRouter = Router();

mfaRouter.use(authenticate);

mfaRouter.post('/setup', async (req: AuthRequest, res, next) => {
  try {
    const result = await setupMfa(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

mfaRouter.post(
  '/enable',
  validateBody(enableMfaSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await enableMfa(req.user!.id, req.body.code);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);