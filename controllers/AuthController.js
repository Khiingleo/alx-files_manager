import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers('Authorization') || '';

    const credentials = authHeader.split(' ')[1];
    if (!credentials) {
      return res.status(401).send({ error: 'Unauthorized' });
    }

    const decodedCredentials = Buffer.from(credentials, 'base64').toString('utf-8');
    const email = decodedCredentials.split(':')[0];
    const pwd = decodedCredentials.split(':')[1];

    if (!email || !pwd) {
      return res.status(401).send({ error: 'Unauthorized' });
    }

    const pwdencode = sha1(pwd);
    const user = await dbClient.users.findOne({
      email,
      password: pwdencode,
    });
    if (!user) {
      return res.status(401).send({ error: 'Unauthorized' });
    }

    const token = uuidv4();
    const key = `auth_${token}`;
    const expire = 86400;

    await redisClient.set(key, user._id.toString(), expire);

    return res.status(200).send({ token });
  }

  static async getDisconnect(req, res) {
    async function getIdKey(req) {
      const userDetail = { userId: null, key: null };

      const token = req.header('X-Token');
      if (!token) {
        return userDetail;
      }
      userDetail.key = `auth_${token}`;
      userDetail.userId = await redisClient.get(userDetail.key);

      return userDetail;
    }
    const { userId, key } = await getIdKey(req);

    if (!userId) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    await redisClient.del(key);

    return res.status(204).send();
  }
}

module.exports = AuthController;
