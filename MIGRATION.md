# Migration Guide: Legacy to Modern Stack

This guide documents the changes made to update Lords of the Fey to use modern libraries and Docker.

## What Changed

### Dependencies Updated
- **Express**: 4.x (old) → 4.18.2 (latest 4.x)
- **MongoDB**: 2.2.x (old) → 6.3.0 (latest stable)
- **Socket.io**: 1.0.x (old) → 4.7.2 (latest)
- **Passport**: 0.2.x → 0.7.0
- **Node.js requirement**: 18.0.0+

### Code Changes

#### MongoDB Updates
- **MongoClient API**: Updated from old callback pattern to modern pattern
  - Old: `new MongoClient.connect(url, callback)`
  - New: `new MongoClient(url); client.connect(callback)`
- **ObjectID**: Updated to use `new ObjectId()` constructor
- **Collection methods**: Still use callbacks (compatible with 6.x)

#### init.mongo.js
- Updated database name from `databaseName` to `lotf`
- Changed `db.save()` to `db.insertOne()` (modern API)
- Changed shell command from `mongo` to `mongosh`

#### config.js
- Added environment variable support for Docker deployment
- All configuration can now be set via environment variables
- Defaults work for local development with Docker Compose

### New Files Added

#### Docker Support
- **Dockerfile**: Multi-stage build for Node.js app
- **docker-compose.yml**: Complete stack (MongoDB 7.0 + Node.js app)
- **.dockerignore**: Optimized Docker build context
- **.env.example**: Environment variable template

### Breaking Changes for Users

1. **Configuration Method**: 
   - Can no longer edit `config.js` in Docker
   - Must use environment variables (see `.env.example`)
   - For manual setup, can still edit `config.js`

2. **MongoDB Connection String**:
   - Default changed to `mongodb://mongoUser:mongoPassword@mongodb:27017/lotf`
   - Must update if using remote MongoDB

3. **Node.js Version**:
   - Now requires Node.js 18.0.0 or higher
   - Check with: `node --version`

## Running the Application

### With Docker (Recommended)
```bash
docker-compose up
```

### Manual Setup
```bash
npm install
node server.js
```

## Testing the Migration

1. Start the application (Docker or manual)
2. Navigate to `http://localhost:8080`
3. Log in with `hello` / `world` or `goodbye` / `world`
4. Create a new game to verify database connectivity
5. Test gameplay to ensure Socket.io works correctly

## Troubleshooting

### MongoDB Connection Error
- Check `MONGO_STRING` environment variable (Docker)
- Check `mongoString` in `config.js` (manual)
- Ensure MongoDB is running and accessible

### Port Already in Use
- Check what's running on port 8080: `lsof -i :8080`
- Change `PORT` environment variable or config setting

### Socket.io Connection Issues
- Check browser console for errors
- Ensure `ORIGIN` matches your deployment domain
- Check CORS headers are correct

### Session Persistence Issues
- Ensure MongoDB session store is connected
- Check `mongoStore` connection events in logs
- Verify `SESSION_SECRET` is set (required in production)
