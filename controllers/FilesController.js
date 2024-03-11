import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile, readFileSync } from 'fs';
import Queue from 'bull';
// import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const fileQ = new Queue('fileQ');
    const path = process.env.FOLDER_PATH || '/tmp/files_manager';

    async function findIdkey(req) {
      const userInfo = { userId: null, key: null };

      const token = req.header('X-Token');
      if (!token) {
        return userInfo;
      }

      userInfo.key = `auth_${token}`;
      userInfo.userId = await redisClient.get(userInfo.key);

      return userInfo;
    }

    const { userId } = await findIdkey(req);

    function isValidUser(id) {
      try {
        ObjectId(id);
      } catch (error) {
        return false;
      }
      return true;
    }

    if (!isValidUser(userId)) {
      return res.status(401).send({ error: 'Unauthorized' });
    }

    const user = await dbClient.users.findOne({ _id: ObjectId(userId) });
    if (!user) {
      return res.status(401).send({ error: 'Unauthorized' });  
    }

    const fileName = req.body.name;
    if (!fileName) {
      return res.status(400).send({ error: 'Missing name' });  
    }

    const fileType = req.body.type;
    if (!fileType || !['folder', 'file', 'image'].includes(fileType)) {
      return res.status(400).send({ error: 'Missing type' });  
    }

    const fileData = req.body.data;
    if (!fileData && fileType !== 'folder') {
      return res.status(400).send({ error: 'Missing data' });  
    }

    const publicFile = req.body.isPublic || false;
    let parentId = req.body.parentId || 0;
    parentId = parentId === '0' ? 0 : parentId;
    if (parentId !== 0) {
      const parentFile = await dbClient.files.findOne({ _id: ObjectId(parentId) });
      if (!parentFile) {
        return res.status(400).send({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).send({ error: 'Parent is not a folder' });
      }
    }

    const fileInsertData = {
      userId: user._id,
      name: fileName,
      type: fileType,
      isPublic: publicFile,
      parentId,
    };

    if (fileType === 'folder') {
      await dbClient.files.insertOne(fileInsertData);
      return res.status(201).send({
        id: fileInsertData._id,
        userId: fileInsertData.userId,
        name: fileInsertData.name,
        type: fileInsertData.type,
        isPublic: fileInsertData.isPublic,
        parentId: fileInsertData.parentId,
      });
    }

    const fileUid = uuidv4();

    const decData = Buffer.from(fileData, 'base64');
    const filePath = `${path}/${fileUid}`;

    mkdir(path, { recursive: true }, (error) => {
      if (error) {
        return res.status(400).send({ error: error.message });
      }
      return true;
    });

    writeFile(filePath, decData, (error) => {
      if (error) {
        return res.status(400).send({ error: error.message });
      }
      return true;
    });

    fileInsertData.localPath = filePath;
    await dbClient.files.insertOne(fileInsertData);

    fileQ.add({
      userId: fileInsertData.userId,
      fileId: fileInsertData._id,
    });

    return res.status(201).send({
      id: fileInsertData._id,
      userId: fileInsertData.userId,
      name: fileInsertData.name,
      type: fileInsertData.type,
      isPublic: fileInsertData.isPublic,
      parentId: fileInsertData.parentId,
    });
  }

  static async getShow(request, response) {
    const token = request.headers['x-token'];
    if (!token) { 
       return response.status(401).json({ error: 'Unauthorized' }); 
    }
    const keyId = await redisClient.get(`auth_${token}`);
    if (!keyId) {
       return response.status(401).json({ error: 'Unauthorized' });
    }
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(keyId) });
    if (!user) {
       return response.status(401).json({ error: 'Unauthorized' }); 
    }

    const idFile = request.params.id || '';
    const fileDocument = await dbClient.db
      .collection('files')
      .findOne({ _id: ObjectId(idFile), userId: user._id });
    if (!fileDocument) {
      return response.status(404).send({ error: 'Not found' });  
    }

    return response.send({
      id: fileDocument._id,
      userId: fileDocument.userId,
      name: fileDocument.name,
      type: fileDocument.type,
      isPublic: fileDocument.isPublic,
      parentId: fileDocument.parentId,
    });
  }
}

module.exports = FilesController;