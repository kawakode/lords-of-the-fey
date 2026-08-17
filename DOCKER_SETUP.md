# Docker Setup Guide for Lords of the Fey

## Quick Start

### Prerequisites
- Docker Desktop ([download](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop on Mac and Windows)

### First Time Setup

```bash
# 1. Navigate to the project directory
cd lords-of-the-fey

# 2. Create environment file
cp .env.example .env

# 3. Generate a secure session secret (REQUIRED)
# On Linux/Mac:
SESSION_SECRET=$(openssl rand -hex 32)
echo "SESSION_SECRET=$SESSION_SECRET" >> .env

# On Windows PowerShell:
$secret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
Add-Content .env "SESSION_SECRET=$secret"

# 4. Start the services
docker-compose up

# 5. Wait for MongoDB to be ready (you'll see "Store is ready to use" in logs)

# 6. Open http://localhost:8080 in your browser
```

**Note:** SESSION_SECRET is required and must be a strong random value. Docker will refuse to start without it.

### Test Login
- Username: `hello` or `goodbye`
- Password: `world`

## Common Commands

### Start Services
```bash
docker-compose up
```

### Start in Background
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# View all logs
docker-compose logs -f

# View only app logs
docker-compose logs -f app

# View only MongoDB logs
docker-compose logs -f mongodb
```

### Access MongoDB Shell
```bash
docker-compose exec mongodb mongosh mongodb://mongoUser:mongoPassword@localhost:27017/lotf
```

### Rebuild Docker Image (after dependency changes)
```bash
docker-compose build
docker-compose up
```

### Reset Database
```bash
docker-compose down -v
docker-compose up
```

## Configuration

### Environment Variables

Edit `.env` file to configure:

```env
# MongoDB
MONGO_STRING=mongodb://mongoUser:mongoPassword@mongodb:27017/lotf

# Server
PORT=8080
LISTENING_IP=0.0.0.0
SESSION_SECRET=your-secret-key-here
ORIGIN=http://localhost:8080

# OAuth (optional)
FACEBOOK_ENABLED=false
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

# Twitter (optional)
TWITTER_ENABLED=false
TWITTER_CONSUMER_KEY=...
TWITTER_CONSUMER_SECRET=...

# Google (optional)
GOOGLE_ENABLED=false
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Docker Files Explained

### Dockerfile
- Based on Node.js 18 Alpine (lightweight)
- Installs production dependencies only
- Exposes port 8080
- Runs `node server.js`

### docker-compose.yml
**Services:**
- **mongodb**: MongoDB 7.0 instance
  - Persists data to `mongodb_data` volume
  - Initializes database with `init.mongo.js`
  - Health check ensures readiness before app starts

- **app**: Node.js application
  - Depends on healthy MongoDB
  - Loads environment variables from `.env`
  - Maps port 8080
  - Volumes for live reload (optional)

### .dockerignore
Excludes unnecessary files from Docker build context:
- `.git`, `node_modules`, `.env` (local)
- IDE files, documentation
- Reduces build size and time

## Troubleshooting

### Port 8080 Already in Use
```bash
# Find what's using the port
lsof -i :8080

# Either stop that process or change PORT in .env
```

### MongoDB Connection Failed
```bash
# Check MongoDB is healthy
docker-compose ps

# Check MongoDB logs
docker-compose logs mongodb

# Ensure MONGO_STRING is correct in .env
```

### Can't Log In
1. Check DATABASE RESET section above
2. Verify users were created:
   ```bash
   docker-compose exec mongodb mongosh mongodb://mongoUser:mongoPassword@localhost:27017/lotf
   db.users.find()
   ```
3. Logs should show default test users created at startup

### Changes Not Appearing
1. Restart services: `docker-compose down && docker-compose up`
2. Or use live reload by adding volume mounts to docker-compose.yml

### View Container Details
```bash
# Inspect container
docker inspect lotf-app

# Check environment variables
docker-compose config
```

## Production Deployment

For production, consider:

1. **Use Environment Variables Exclusively**
   - Never use default session secret
   - Set strong DATABASE password
   - Set appropriate ORIGIN for your domain

2. **Security**
   - Change MongoDB credentials
   - Use HTTPS (add reverse proxy like Nginx)
   - Set secure session options

3. **Scaling**
   - Run multiple app instances behind load balancer
   - MongoDB replication set for high availability
   - Use external MongoDB service (Atlas, etc.)

4. **Monitoring**
   - Add health check endpoints
   - Log aggregation
   - Performance monitoring

## Example Production docker-compose.yml

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongodb_data:/data/db
    networks:
      - internal

  app:
    build: .
    environment:
      MONGO_STRING: mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongodb:27017/lotf
      SESSION_SECRET: ${SESSION_SECRET}
      ORIGIN: ${ORIGIN}
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - internal
      - external
    restart: unless-stopped

networks:
  internal:
  external:

volumes:
  mongodb_data:
```

Load from `.env.production`:
```bash
docker-compose --env-file .env.production up
```
