import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { mkdir, writeFile, readFileSync } from 'fs';
import Queue from 'bull';
// import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';

class FilesController {
    static async postUpload(req, res) {
        const fileQue = new Queue('fileQue');
        const path = process.env.FOLDER_PATH || '/tmp/files_manager';

        async function findIdKey(req) {
            const userData = { userId: null, key: null };

            const token = req.header('X-Token');
            if (!token) {
                return userData;
            }

            userData.key = `auth_${token}`;
            userData.userId = await redisClient.get(userData.key);

            return userData;
        }
        const { userId } = await findIdKey(req);

        function checkifValid(id) {
            try {
                ObjectId(id);
            } catch (error) {
                return false;
            }
            return true;
        }

        if (!checkifValid(userId)) {
            return res.status(401).send({ error: 'Unathorized' });
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
            return res.status(400).send({ error: 'Missing type'} );
        }
        const fileData = req.body.data;
        if (!fileData || fileType !== 'folder') {
            res.status(400).send({ error: 'Missing data' });
        }
        const isPublicFile = req.body.isPublic || false;
        let parentId = req.body.parentId || 0;

        if (parentId !== 0) {
            const parentFile = await dbClient.files.findOne({ _id: ObjectId(parentId) });
            if (!parentFile) {
                return res.status(400).send({ error: 'Parent not found' });
            }
            if (parentFile.type !== 'folder') {
                return res.status(400).send({ error: 'Parent is not a folder' });
            }
        }

        const insertData = {
            userId: user._id,
            name: fileName,
            type: fileType,
            isPublic: isPublicFile,
            parentId,
        };

        if (fileType === 'folder') {
            await dbClient.files.insertOne(insertData);
            return res.status(201).send({
                id: insertData._id,
                userId: insertData.userId,
                name: insertData.name,
                type: insertData.type,
                isPublic: insertData.isPublic,
                parentId: insertData.parentId,
            });
        }

        const fUid = uuidv4();

        const decodeData = Buffer.from(fileData, 'base64');
        const filePath = `${path}/${fUid}`;

        mkdir(path, { recursive: true }, (error) => {
            if (error) {
                return res.status(400).send({ error: error.message });
            }
            return true;
        });

        writeFile(filePath, decodeData, (error) => {
            if (error) {
                return res.status(400).send({ error: error.message });
            }
            return true;
        });

        insertData.localPath = filePath;
        await dbClient.files.insertOne(insertData);

        fileQue.add({
            userId: insertData.userId,
            fileId: insertData._id,
        });

        return res.status(201).send({
            id: insertData._id,
            userId: insertData.userId,
            name: insertData.name,
            type: insertData.type,
            isPublic: insertData.isPublic,
            parentId: insertData.parentId,
        });
    }
}