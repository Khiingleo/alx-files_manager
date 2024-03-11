import sha1 from 'sha1';
import Queue from 'bull';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import { RedisClient } from 'redis';
import redisClient from '../utils/redis';

const userQ = new Queue('userQ');

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

    await userQ.add({
      userId: insertStat.insertedId.toString(),
    });

    return res.status(201).send(createdUser);
  }

  static async getMe(request, response) {
    async function getIdKey(request) {
      const userData = { userId: null, key: null };

      const token = request.header('X-Token');
      if (!token) {
        return userData;
      }

      userData.key = `auth_${token}`;
      userData.userId = await redisClient.get(userData.key);

      return userData;
    }
    const { userId } = await getIdKey(request);

    const user = await dbClient.users.findOne({ _id: ObjectId(userId) });
    if (!user) {
      return response.status(401).send({ error: 'Unauthorized' });
    }

    const userData = { id: user._id, ...user };
    delete userData._id;
    delete userData.password;

    return response.status(200).send(userData);
  }
}

module.exports = UsersController;
