declare namespace Express {
  export interface Request {
    user: import('../../models/userModel').IUser;
    files: {
      [fieldname: string]: Express.Multer.File[];
    };
  }
}
