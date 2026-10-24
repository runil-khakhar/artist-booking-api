import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { authRouter } from './modules/auth/auth.routes';
import { bookingRouter } from './modules/bookings/booking.routes';
import { healthRouter } from './modules/health/health.routes';

export const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/bookings', bookingRouter);

app.use(notFound);
app.use(errorHandler);
