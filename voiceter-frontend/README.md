# Voiceter AI Landing Page

A modern Next.js 14 application for the Voiceter AI voice survey platform, built with TypeScript and Tailwind CSS.

## 🚀 Features

- **Next.js 14** - Latest version with improved performance and features
- **React 18** - Latest React version with enhanced capabilities
- **Tailwind CSS** - Utility-first CSS framework for rapid UI development
- **Supabase Integration** - Backend services for waitlist management
- **Voice Demo Experience** - Interactive voice survey demonstrations

## 📋 Prerequisites

- Node.js (v14.x or higher)
- npm or yarn

## 🔧 Environment Configuration

This application requires environment variables to be configured. Create a `.env.local` file in the root directory based on `.env.local.example`:

### Required Environment Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Backend WebSocket URL
# Development: Use local backend
NEXT_PUBLIC_BACKEND_URL=ws://localhost:8080

# Production: Use deployed backend
# NEXT_PUBLIC_BACKEND_URL=wss://your-backend-domain.com
```

### Environment Variable Details

#### NEXT_PUBLIC_SUPABASE_URL
Your Supabase project URL for waitlist management and authentication.

- **Format**: `https://your-project-id.supabase.co`
- **Required**: Yes (for waitlist functionality)
- **Where to find**: Supabase Dashboard → Project Settings → API → Project URL
- **Example**: `https://abcdefghijklmnop.supabase.co`

#### NEXT_PUBLIC_SUPABASE_ANON_KEY
Your Supabase anonymous key for client-side access.

- **Format**: Long alphanumeric string (JWT token)
- **Required**: Yes (for waitlist functionality)
- **Security**: Safe to use in client-side code (public key with row-level security)
- **Where to find**: Supabase Dashboard → Project Settings → API → Project API keys → `anon` `public`
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### NEXT_PUBLIC_BACKEND_URL
WebSocket URL for the Voiceter backend server that handles voice survey demos.

- **Format**: `ws://host:port` (development) or `wss://domain` (production)
- **Required**: Yes (for voice demo functionality)
- **Default**: `ws://localhost:8080` (if not specified)
- **Protocol**:
  - `ws://` - Insecure WebSocket for local development
  - `wss://` - Secure WebSocket for production (required for HTTPS sites)

### Backend URL Configuration Examples

#### Local Development
When running the backend server locally on your machine:

```bash
NEXT_PUBLIC_BACKEND_URL=ws://localhost:8080
```

**Prerequisites**:
- Voiceter backend server must be running on port 8080
- Start backend with: `cd voiceter-backend && npm run dev`

#### Production (AWS ECS Fargate)
When the backend is deployed to AWS with Application Load Balancer:

```bash
NEXT_PUBLIC_BACKEND_URL=wss://api.voiceter.com
```

**Prerequisites**:
- Backend deployed to AWS ECS Fargate
- Application Load Balancer configured with SSL certificate
- WebSocket support enabled on ALB
- DNS record pointing to ALB

#### Staging Environment
For testing with a staging backend deployment:

```bash
NEXT_PUBLIC_BACKEND_URL=wss://staging-api.voiceter.com
```

#### Custom Port (Development)
If your backend runs on a different port:

```bash
NEXT_PUBLIC_BACKEND_URL=ws://localhost:3001
```

### Environment Setup Guide

#### Step 1: Copy Example File
```bash
cp .env.local.example .env.local
```

#### Step 2: Configure Supabase
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Copy your Project URL and Anon Key from the API settings
3. Update `.env.local` with your Supabase credentials

#### Step 3: Configure Backend URL
Choose the appropriate backend URL based on your environment:

- **Local Development**: Use `ws://localhost:8080` (default)
- **Production**: Use your deployed backend URL with `wss://` protocol
- **Testing**: Use staging backend URL if available

#### Step 4: Verify Configuration
After setting up `.env.local`, restart your development server:

```bash
npm run dev
```

The application will validate environment variables on startup and warn if any are missing.

### Important Notes

> **🔒 Security**: Never commit `.env.local` to version control. It's already included in `.gitignore`.

> **🔄 Build Time**: Environment variables with `NEXT_PUBLIC_` prefix are embedded at build time. Changes require a rebuild for production.

> **🌐 Protocol Matching**: If your frontend uses HTTPS, your backend URL must use `wss://` (secure WebSocket). Browsers block insecure WebSocket connections from secure pages.

> **🔌 Backend Dependency**: The voice demo functionality requires a running Voiceter backend server. The landing page and waitlist features work independently.

## 🛠️ Installation

1. Install dependencies:
  ```bash
  npm install
  # or
  yarn install
  ```

2. Configure environment variables:
  ```bash
  cp .env.local.example .env.local
  # Edit .env.local with your configuration
  ```

3. Start the development server:
  ```bash
  npm run dev
  # or
  yarn dev
  ```

4. Open [http://localhost:4028](http://localhost:4028) with your browser to see the result.

## 📁 Project Structure

```
nextjs-js-tailwind/
├── public/             # Static assets
├── src/
│   ├── app/            # App router components
│   │   ├── layout.tsx  # Root layout component
│   │   └── page.tsx    # Main page component
│   ├── components/     # Reusable UI components
│   ├── styles/         # Global styles and Tailwind configuration
├── next.config.mjs     # Next.js configuration
├── package.json        # Project dependencies and scripts
├── postcss.config.js   # PostCSS configuration
└── tailwind.config.js  # Tailwind CSS configuration

```

## 🧩 Page Editing

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

## 🎨 Styling

This project uses Tailwind CSS for styling with the following features:
- Utility-first approach for rapid development
- Custom theme configuration
- Responsive design utilities
- PostCSS and Autoprefixer integration

## 📦 Available Scripts

- `npm run dev` - Start development server on port 4028
- `npm run build` - Build the application for production
- `npm run start` - Start the development server
- `npm run serve` - Start the production server
- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier

## 🔍 Troubleshooting

### WebSocket Connection Issues

If you're experiencing WebSocket connection issues:

1. **Verify Backend URL**: Ensure `NEXT_PUBLIC_BACKEND_URL` is set correctly in `.env.local`
   ```bash
   # Check your .env.local file
   cat .env.local | grep BACKEND_URL
   ```

2. **Check Protocol**: Use `ws://` for local development, `wss://` for production
   - ❌ Wrong: `http://localhost:8080` (HTTP, not WebSocket)
   - ✅ Correct: `ws://localhost:8080` (WebSocket)
   - ❌ Wrong: `ws://api.voiceter.com` (insecure in production)
   - ✅ Correct: `wss://api.voiceter.com` (secure WebSocket)

3. **Backend Running**: Ensure the Voiceter backend server is running and accessible
   ```bash
   # Start the backend server
   cd voiceter-backend
   npm run dev
   
   # Verify it's running
   curl http://localhost:8080/health
   ```

4. **Port Conflicts**: Verify the backend is running on the expected port (default: 8080)
   ```bash
   # Check if port 8080 is in use
   netstat -an | grep 8080
   # or on Windows
   netstat -an | findstr 8080
   ```

5. **CORS Configuration**: Ensure the backend allows connections from your frontend origin
   - Backend should allow `http://localhost:4028` in development
   - Backend should allow your production domain in production

6. **Network/Firewall**: Check if firewall or network settings block WebSocket connections
   - Corporate networks may block WebSocket traffic
   - Try disabling VPN if connection fails

### Environment Variables Not Loading

If environment variables aren't being recognized:

1. **Restart Dev Server**: After changing `.env.local`, restart the development server
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

2. **Check Prefix**: Ensure browser-accessible variables start with `NEXT_PUBLIC_`
   - ❌ Wrong: `BACKEND_URL=ws://localhost:8080`
   - ✅ Correct: `NEXT_PUBLIC_BACKEND_URL=ws://localhost:8080`

3. **File Location**: Verify `.env.local` is in the project root directory
   ```bash
   # Should be at voiceter-frontend/.env.local
   ls -la .env.local
   ```

4. **Build Time**: Remember that environment variables are embedded at build time for production
   ```bash
   # After changing .env.local, rebuild for production
   npm run build
   ```

5. **Check Console**: Open browser DevTools and check for environment variable warnings
   - The app validates environment variables on startup
   - Missing variables will be logged to the console

### Common Error Messages

#### "WebSocket connection failed"
**Cause**: Backend URL is incorrect or backend is not running

**Solutions**:
- Verify `NEXT_PUBLIC_BACKEND_URL` in `.env.local`
- Ensure backend server is running: `cd voiceter-backend && npm run dev`
- Check backend health endpoint: `curl http://localhost:8080/health`
- Verify no port conflicts on 8080

#### "CORS error" or "Origin not allowed"
**Cause**: Backend needs to allow your frontend origin

**Solutions**:
- Backend should allow `http://localhost:4028` in development
- Check backend CORS configuration in `voiceter-backend/src/server/config.ts`
- Ensure frontend origin matches backend allowed origins

#### "Environment variable undefined"
**Cause**: Missing `NEXT_PUBLIC_` prefix or server needs restart

**Solutions**:
- Add `NEXT_PUBLIC_` prefix to variable name
- Restart development server after changing `.env.local`
- Verify `.env.local` exists in project root

#### "Mixed content" or "Insecure WebSocket"
**Cause**: Using `ws://` (insecure) on an HTTPS site

**Solutions**:
- Use `wss://` (secure WebSocket) for production
- Ensure backend has SSL certificate configured
- For local development, use `http://localhost:4028` (not HTTPS)

#### "Connection timeout"
**Cause**: Backend is not reachable or taking too long to respond

**Solutions**:
- Check if backend is running and healthy
- Verify network connectivity to backend
- Check firewall settings
- Increase timeout in WebSocket service if needed

### Backend Server Requirements

For the voice demo functionality to work, you need:

1. **Voiceter Backend Server**: Running and accessible
   - Repository: `voiceter-backend/`
   - Default port: 8080
   - Health check: `GET /health`

2. **AWS Services** (for backend):
   - Amazon Bedrock (Nova 2 Sonic model)
   - DynamoDB (for session/response storage)
   - S3 (for audio recordings)
   - Proper IAM permissions configured

3. **Environment Variables** (for backend):
   - `AWS_REGION`
   - `BEDROCK_MODEL_ID`
   - `DYNAMODB_TABLE_PREFIX`
   - `S3_BUCKET_NAME`

See `voiceter-backend/README.md` for complete backend setup instructions.

### Testing Your Configuration

#### Test 1: Verify Environment Variables
```bash
# In voiceter-frontend directory
npm run dev

# Check console output for environment validation warnings
# Open http://localhost:4028 and check browser console
```

#### Test 2: Test Backend Connection
```bash
# In a separate terminal, test backend health
curl http://localhost:8080/health

# Should return: {"status":"healthy"}
```

#### Test 3: Test WebSocket Connection
1. Open http://localhost:4028/full-demo-experience-page
2. Select a demo questionnaire
3. Open browser DevTools → Network tab → WS filter
4. Look for WebSocket connection to your backend URL
5. Connection should show "101 Switching Protocols" status

#### Test 4: Test Voice Demo
1. Start a demo session
2. Allow microphone access when prompted
3. Speak into microphone
4. Verify transcriptions appear in real-time
5. Verify AI responses play back

If any test fails, refer to the specific error message troubleshooting above.

## 📱 Deployment

### Building for Production

Build the application for production:

```bash
npm run build
```

This will create an optimized production build in the `.next` directory.

### Environment Variables in Production

When deploying to production, you need to configure environment variables in your hosting platform:

#### Vercel Deployment
1. Go to your project settings in Vercel
2. Navigate to "Environment Variables"
3. Add the following variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_BACKEND_URL` (use `wss://` protocol)
4. Redeploy your application

#### AWS Amplify Deployment
1. Go to your app in AWS Amplify Console
2. Navigate to "Environment variables"
3. Add the required variables with production values
4. Trigger a new build

#### Netlify Deployment
1. Go to Site settings → Build & deploy → Environment
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_BACKEND_URL`
3. Trigger a new deploy

#### Docker Deployment
When deploying with Docker, pass environment variables at runtime:

```bash
docker run -p 4028:4028 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key \
  -e NEXT_PUBLIC_BACKEND_URL=wss://api.voiceter.com \
  voiceter-frontend
```

Or use a `.env` file with Docker Compose:

```yaml
# docker-compose.yml
services:
  frontend:
    image: voiceter-frontend
    ports:
      - "4028:4028"
    env_file:
      - .env.production
```

### Production Checklist

Before deploying to production, ensure:

- ✅ `NEXT_PUBLIC_BACKEND_URL` uses `wss://` (secure WebSocket)
- ✅ Backend server is deployed and accessible
- ✅ Backend has SSL certificate configured
- ✅ CORS is configured to allow your production domain
- ✅ Supabase credentials are for production project
- ✅ All environment variables are set in hosting platform
- ✅ Build completes without errors: `npm run build`
- ✅ Test the production build locally: `npm run start`

### Testing Production Build Locally

Test your production build locally before deploying:

```bash
# Build the application
npm run build

# Start the production server
npm run start

# Open http://localhost:4028 and test functionality
```

This helps catch environment variable issues before deployment.

## 📚 Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial

You can check out the [Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 🙏 Acknowledgments

- Built with [Rocket.new](https://rocket.new)
- Powered by Next.js and React
- Styled with Tailwind CSS

Built with ❤️ on Rocket.new