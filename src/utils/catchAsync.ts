import { Request, Response, NextFunction } from 'express';

// TODO: CHECK PROMISE RETURN TYPE
type TFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export default (fn: TFunction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
