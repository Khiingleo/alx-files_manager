import sha1 from 'sha1';
import Queue from 'bull';
import dbClient from '../utils/db';
// import redisClient from '../utils/redis';
// import { ObjectId } from 'mongodb';

const queue = new Queue('queue');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).send({ error: 'Missing email' });
    }
    if (!password) {
      return res.status(400).send({ error: 'Missing password' });
    }
    const emailExists = await dbClient.users.findOne({ email });
    if (emailExists) {
      return res.status(400).send({ error: 'Already exist' });
    }

    const pwd = sha1(password);

    const insertStat = await dbClient.users.insertOne({
      email,
      password: pwd,
    });

    const createdUser = {
      id: insertStat.insertedId,
      email,
    };

    await queue.add({
      userId: insertStat.insertedId.toString(),
    });

    return res.status(201).send(createdUser);
  }
}

module.exports = UsersController;
