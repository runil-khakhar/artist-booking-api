import type { Request, Response } from 'express';
import { currentUser } from '../../middleware/authenticate';
import { sendSuccess } from '../../shared/response';
import { idParamsSchema } from '../../shared/schemas';
import type { Booking } from './booking.repository';
import { createBookingSchema, updateStatusSchema } from './booking.schemas';
import * as bookingService from './booking.service';

function toBookingResponse(booking: Booking) {
  return {
    id: booking.id,
    artist_id: booking.artist_id,
    client_id: booking.client_id,
    status: booking.status,
    event_start: booking.event_start,
    event_end: booking.event_end,
    notes: booking.notes,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
  };
}

export async function createBooking(req: Request, res: Response): Promise<void> {
  const body = createBookingSchema.parse(req.body);

  const booking = await bookingService.createBooking({
    clientId: currentUser(req).id,
    artistId: body.artist_id,
    start: body.event_start,
    end: body.event_end,
    notes: body.notes,
  });

  sendSuccess(res, toBookingResponse(booking), 201);
}

export async function updateBookingStatus(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  const { status } = updateStatusSchema.parse(req.body);

  const booking = await bookingService.updateBookingStatus(id, status, currentUser(req));

  sendSuccess(res, toBookingResponse(booking));
}
