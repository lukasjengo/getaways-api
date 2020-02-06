import { Request, Response, NextFunction } from 'express';

import Review from '../models/reviewModel';
import * as factory from './handlerFactory';

export const getAllReviews = factory.getAll(Review);

export const setTourUserIds = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Allow nested routes
  if (!req.body.tour) req.body.tour = req.params.tourId;
  if (!req.body.user) req.body.user = req.user.id;
  next();
};

export const getReview = factory.getOne(Review);
export const createReview = factory.createOne(Review);
export const deleteReview = factory.deleteOne(Review);
export const updateReview = factory.updateOne(Review);
