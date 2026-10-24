import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as bookingController from './booking.controller';

export const bookingRouter = Router();

bookingRouter.post('/', authenticate, requireRole('client'), bookingController.createBooking);

// Who may make each status change is decided by the state machine, not here.
bookingRouter.patch('/:id/status', authenticate, bookingController.updateBookingStatus);
