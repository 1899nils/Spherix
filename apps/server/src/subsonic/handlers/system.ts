import { Router } from 'express';
import { sendResponse } from '../response.js';

const router = Router();

/** ping — Server status check */
router.get('/ping', (req, res) => {
  sendResponse(req, res);
});
router.post('/ping', (req, res) => {
  sendResponse(req, res);
});

/** getLicense — Always return a valid license */
router.get('/getLicense', (req, res) => {
  sendResponse(req, res, {
    license: {
      valid: true,
      email: 'user@musicserver.local',
      licenseExpires: '2099-12-31T23:59:59',
    },
  });
});
router.post('/getLicense', (req, res) => {
  sendResponse(req, res, {
    license: {
      valid: true,
      email: 'user@musicserver.local',
      licenseExpires: '2099-12-31T23:59:59',
    },
  });
});

export default router;
