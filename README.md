# DomainPeek

A production-grade web application that provides comprehensive domain analysis including WHOIS/RDAP registration data, DNS records analysis, security scoring, and interactive visualizations. Built with modern web technologies and designed to be a powerful alternative to services like who.is.

**Live demo:** [https://domainpeek.xyz](https://domainpeek.xyz)

## 🚀 Features

### Core Analysis Engine
- **WHOIS & RDAP Lookup**: Real-time domain registration for **all IANA-listed TLDs** (legacy and new gTLDs like `.xyz`, `.fans`, `.app`, `.io`, `.ai`, …). RDAP uses the live [IANA RDAP bootstrap](https://data.iana.org/rdap/dns.json); WHOIS uses registry servers plus IANA referral fallback.
- **DNS Record Analysis**: Complete DNS resolution including A, AAAA, MX, TXT, CNAME, SOA, NS, PTR records
- **Nameserver Health Checks**: Monitor nameserver response times and availability
- **ASN & IP Intelligence**: Autonomous System Number and IP geolocation data
- **User Environment Detection**: Display user's public IP, ISP, and network information

### Security & Best Practices
- **Security Scoring Engine**: Weighted scoring system (0-100) based on domain configuration
- **DNSSEC Validation**: Check for DNS Security Extensions implementation
- **Email Security Analysis**: SPF, DKIM, DMARC record validation
- **SSL/TLS Integration**: Certificate analysis (planned integration with SSL Analyzer)
- **Best Practice Recommendations**: Actionable insights for domain optimization

### Interactive Visualizations
- **D3.js Powered Charts**: Interactive domain relationship graphs and score breakdowns
- **Theme-Aware Design**: Automatic light/dark theme adaptation for all visualizations
- **Security Score Charts**: Bar charts with weighted security category breakdowns
- **Risk Distribution**: Pie charts showing risk level distribution across categories
- **Domain Timeline**: Interactive timeline of domain events with zoom/pan capabilities
- **Network Topology**: Force-directed graphs showing domain infrastructure relationships
- **Performance Analytics**: Real-time response time charts and availability metrics
- **Domain Hierarchy Visualization**: Root → Nameservers → Records → IPs mapping
- **Health Status Indicators**: Color-coded visual representation of domain health
- **Real-time Data Updates**: Live monitoring and analysis capabilities

### Export & Sharing
- **Multiple Export Formats**: JSON, CSV, PDF reports
- **Share Links**: Generate temporary shareable analysis links
- **API Access**: RESTful API for programmatic access
- **Webhook Integration**: Real-time notifications for domain changes

## 🏗️ Architecture

This project follows a monorepo structure with separate frontend and backend applications:

```
domainpeek/
├── apps/
│   ├── frontend/              # Next.js 15 with React 19
│   └── backend/               # Express.js with TypeScript
├── docker-compose.yml         # Main Docker orchestration
├── docker-compose.override.yml # Docker health check fixes
├── docker-compose.dev.yml     # Development overrides
├── nginx.conf                 # Nginx reverse proxy configuration
└── deploy.sh                  # Automated deployment script
```

### Tech Stack

**Frontend**
- Next.js 15 with App Router
- React 19 with TypeScript
- TailwindCSS 4 for styling
- D3.js for interactive data visualizations
- Theme-aware chart system with automatic light/dark mode switching
- React Query for data fetching
- Framer Motion for UI animations
- next-themes for seamless theme management

**Backend**
- Express.js with TypeScript
- Redis for caching and session management
- `whoiser` (WHOIS + IANA TLD list), `tldts` (public suffix), axios RDAP client
- OpenAPI/Swagger documentation
- Jest unit tests + TLD smoke script
- Docker containerization

## 🚦 Getting Started

Try the hosted app at **[domainpeek.xyz](https://domainpeek.xyz)** or run locally:

### Prerequisites

- Node.js >= 22.0.0
- npm >= 8.0.0
- Docker & Docker Compose (optional, for local development)
- Redis (optional, will use in-memory cache if not available)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kyroskoh/domainpeek.git
   cd domainpeek
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy example environment files
   cp apps/frontend/.env.example apps/frontend/.env.local
   cp apps/backend/.env.example apps/backend/.env
   ```

4. **Start development servers**
   ```bash
   # Start both frontend and backend
   npm run dev
   
   # Or start individually
   npm run dev:frontend  # http://localhost:4000
   npm run dev:backend   # http://localhost:4001
   ```

### Using Docker (Recommended for Production)

**Quick Start:**
```bash
# Clone and start with Docker
git clone https://github.com/kyroskoh/domainpeek.git
cd domainpeek
docker-compose up --build
```

**Development with Docker:**
```bash
# Start in development mode with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Or use the deployment script
./deploy.sh --environment development

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Optional services (Redis cache, Nginx proxy)
./deploy.sh --profile redis,nginx
```

**Available services:**
- Frontend: `http://localhost:4000`
- Backend API: `http://localhost:4001`
- API Documentation: `http://localhost:4001/docs`
- Health Checks: `http://localhost:4000/api/health` & `http://localhost:4001/health`

### Docker Troubleshooting

**Common Issues & Solutions:**

1. **Network iptables error on Windows:**
   ```bash
   # If you see iptables errors, the fix is already included
   # Uses default Docker networking instead of custom bridge
   docker-compose down && docker-compose up --build
   ```

2. **Frontend can't connect to backend:**
   ```bash
   # Check health status
   curl http://localhost:4000/api/health

   # Should show backend as "healthy", not "unreachable"
   # Fixed via docker-compose.override.yml and correct environment variables
   ```

3. **Domain analysis fails:**
   ```bash
   # Test backend directly
   curl http://localhost:4001/api/analyze/google.com

   # Should return comprehensive domain data
   # Fixed via proper Docker service communication
   ```

4. **Services won't start:**
   ```bash
   # Clean up and rebuild
   docker-compose down
   docker system prune -f
   docker-compose up --build
   ```

**Health Check Commands:**
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Test connectivity
curl http://localhost:4000/api/health
curl http://localhost:4001/health
```

## 📊 Usage

### Web Interface

1. **Navigate to the application** at `http://localhost:4000`
2. **Enter a domain name** in the search box (e.g., `example.com`)
3. **View comprehensive analysis** including:
   - Domain registration details (WHOIS/RDAP)
   - DNS record breakdown
   - Security score and recommendations
   - Interactive theme-aware visualizations
   - Nameserver health status
   - Export options in multiple formats

#### Testing Chart Themes

Visit `http://localhost:4000/test-charts` to test all visualization components with theme switching capabilities.

### API Usage

```bash
# Analyze a domain
curl -X GET "http://localhost:4001/api/analyze/example.com"

# Get DNS records only
curl -X GET "http://localhost:4001/api/dns/example.com"

# Export analysis as PDF
curl -X GET "http://localhost:4001/api/export/example.com.pdf"
```

### API Documentation
Visit `http://localhost:4001/docs` for interactive Swagger documentation.

## 🎨 Theme System

### Automatic Theme Adaptation

The application features a comprehensive theme system that automatically adapts all visualizations and UI components for optimal viewing in both light and dark modes.

#### Chart Theme Features
- **Real-time Switching**: Charts instantly adapt when users toggle between light/dark themes
- **Proper Contrast**: All text and visual elements maintain proper contrast ratios for accessibility
- **Color Consistency**: Uses a unified color palette across all D3.js visualizations
- **Background Adaptation**: Chart backgrounds, tooltips, and panels automatically adjust

#### Supported Components
- Security Score Charts (bar charts with category breakdowns)
- Risk Level Pie Charts (risk distribution visualization)
- Domain Timeline Charts (interactive timeline with zoom/pan)
- Network Topology Diagrams (force-directed graph layouts)
- Performance Analytics Charts (response time and availability metrics)
- Security Trend Charts (historical security score tracking)

#### Theme Testing

Visit `/test-charts` to interactively test all chart components:

```bash
# Start development server
npm run dev

# Navigate to theme testing page
# http://localhost:4000/test-charts
```

### Technical Implementation

The theme system uses:
- `useChartColors()` React hook for real-time theme detection
- CSS custom properties for seamless theme transitions
- D3.js dynamic color application for SVG elements
- next-themes integration for persistent theme preferences

## 🧪 Testing

### Automated Testing

```bash
# Run all workspace tests
npm test

# Backend unit tests (WHOIS/RDAP/analysis)
npm run test --workspace=@domainpeek/backend

# Backend coverage
npm run test:coverage --workspace=@domainpeek/backend

# TLD smoke checks (IANA list + optional live API)
# Start backend first for HTTP checks: npm run dev:backend
npm run smoke:tlds --workspace=@domainpeek/backend
```

Backend suites cover:
- IANA RDAP bootstrap loading and new gTLD availability (`.xyz`, `.fans`, `.app`, …)
- WHOIS parsing, server overrides, and `whoiser` integration
- RDAP-first / WHOIS-fallback analysis orchestration

### Interactive Chart Testing

```bash
# Start development server
npm run dev

# Visit chart testing page
# http://localhost:4000/test-charts
```

The test page includes:
- All visualization components with mock data
- Theme toggle for testing light/dark mode transitions
- Interactive elements to verify responsiveness
- Performance monitoring for chart rendering

## 🛠️ Development

### Project Structure

```
apps/frontend/src/
├── app/                   # Next.js App Router pages
│   └── test-charts/       # Chart testing and theme validation page
├── components/            # Reusable React components
│   ├── analysis/          # Domain analysis components
│   ├── theme/             # Theme management components
│   ├── ui/                # Base UI components
│   └── visualizations/    # D3.js visualization components (theme-aware)
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions and API clients
│   └── chart-colors.ts    # Theme-aware color system for charts
└── types/                 # TypeScript type definitions
apps/backend/src/
├── routes/                # Express route handlers (analyze, whois, rdap, dns, …)
├── services/              # Business logic
│   ├── whois/             # WHOIS via whoiser (all IANA TLDs)
│   ├── rdap/              # RDAP + IANA dns.json bootstrap
│   ├── dns/               # DNS resolution
│   └── security/          # Security scoring
├── middleware/            # Express middleware
├── scripts/               # Smoke / ops scripts
└── types/                 # TypeScript interfaces
```

### Available Scripts

```bash
# Development
npm run dev              # Start both apps in development mode
npm run dev:frontend     # Start only frontend
npm run dev:backend      # Start only backend

# Building
npm run build            # Build both apps for production
npm run build:frontend   # Build frontend only
npm run build:backend    # Build backend only

# Testing
npm test                 # Run all tests
npm run test:frontend    # Test frontend only
npm run test:backend     # Test backend only

# Code Quality
npm run lint             # Lint all code
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking

# Docker
npm run docker:build     # Build Docker images
npm run docker:up        # Start services with Docker Compose
npm run docker:down      # Stop Docker services
```

## 🔧 Configuration

### Environment Variables

**Backend (`apps/backend/.env`)**
```env
PORT=4001
NODE_ENV=development
REDIS_URL=redis://localhost:6379
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
WHOIS_TIMEOUT_MS=10000
WHOIS_FOLLOW=2
RDAP_TIMEOUT_MS=5000
DNS_TIMEOUT_MS=5000
```

**Frontend (`apps/frontend/.env.local`)**
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001
NEXT_PUBLIC_APP_ENV=development
```

### Docker Configuration

**docker-compose.override.yml** (automatically loaded):
```yaml
services:
  frontend:
    # Improved health check that doesn't rely on HTTP endpoints
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('net').connect({host:'127.0.0.1',port:4000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s
```

**Key Docker Features:**
- **Node.js 22 LTS**: Frontend and backend images use `node:22-alpine`
- **Default Networking**: Uses Docker's default bridge network to avoid iptables issues on Windows
- **Health Checks**: Custom Node.js-based health checks for better reliability
- **Service Communication**: Frontend connects to backend via `http://backend:4001`
- **Production Ready**: Optimized Docker builds with multi-stage compilation

## 🚀 Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production servers
npm run start
```

### Docker Production

**✅ Ready for Production** - All known issues resolved:

```bash
# Build production images (includes all fixes)
docker-compose build

# Deploy to production
docker-compose up -d

# Or use the automated deployment script
./deploy.sh --environment production

# With optional services (Redis, Nginx)
./deploy.sh --profile redis,nginx

# Verify deployment health
curl http://localhost:4000/api/health
curl http://localhost:4001/health
```

**Production Features:**
- ✅ **Networking**: Windows iptables compatibility resolved
- ✅ **Health Checks**: Reliable container health monitoring
- ✅ **Service Communication**: Frontend-backend connectivity verified
- ✅ **Domain Analysis**: Full functionality tested with google.com
- ✅ **Override Configuration**: Automatic health check improvements

### Cloud Deployment

The application is designed to be deployed on:
- **Vercel** (Frontend)
- **Railway/Render** (Backend)
- **Redis Cloud** (Cache)
- **Docker containers** on any cloud provider

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Write tests for new features
- Use conventional commit messages
- Ensure code passes linting and formatting checks
- Update documentation for API changes

## 📈 Roadmap

### Phase 1: Core MVP (Current)
- [x] Basic project setup and architecture
- [x] Interactive D3.js visualizations with theme support
- [x] Theme-aware chart system (light/dark mode)
- [x] Security scoring system
- [x] Export functionality (JSON, CSV, PDF)
- [x] WHOIS/RDAP lookup engine (all IANA TLDs / new gTLDs)
- [x] Dedicated `/api/whois` and `/api/rdap` routes wired to services
- [x] DNS analysis engine
- [x] Complete web interface integration
- [x] Domain topology network visualizations
- [x] Security threat analysis and scoring
- [x] Live demo at [domainpeek.xyz](https://domainpeek.xyz)

### Phase 2: Advanced Features
- [x] Interactive D3.js visualizations
- [x] Advanced export options (multiple formats)
- [x] Theme-aware UI components
- [x] Network topology diagrams
- [ ] Real-time monitoring
- [ ] Historical data tracking
- [ ] API rate limiting and authentication

### Phase 3: Enterprise Features
- [ ] Multi-domain bulk analysis
- [ ] Custom alerting and webhooks
- [ ] Integration with external security feeds
- [ ] White-label deployment options
- [ ] Advanced analytics dashboard

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📦 Key libraries (maintained)

| Concern | Package | Notes |
|---------|---------|--------|
| RDAP bootstrap / PSL | `tldts`, `axios` | Full IANA `dns.json` bootstrap cached under `apps/backend/data/` |
| WHOIS | `whoiser` (^1.18) | Maintained; IANA auto-discovery + `allTlds()` for every delegated gTLD/ccTLD |
| Dev runner | `tsx` | Replaces deprecated/unmaintained `ts-node-dev` |
| HTTP tests | `supertest` ^7 | Current major; avoid deprecated v6 |
| Validation | `joi` (built-in types) | Removed deprecated `@types/joi` / `@types/socket.io` |

Removed unused `rdap-client` (unmaintained install scripts). Prefer RDAP via IANA bootstrap + axios.

## 🙏 Acknowledgments

- Built with inspiration from [who.is](https://who.is)
- Live demo: [domainpeek.xyz](https://domainpeek.xyz)
- Uses open-source DNS and WHOIS data sources
- Leverages [IANA RDAP bootstrap](https://data.iana.org/rdap/dns.json) for all RDAP-capable TLDs
- Community feedback and contributions

## 📞 Support

- 📧 Email: support@domainpeek.com
- 🐛 Issues: [GitHub Issues](https://github.com/kyroskoh/domainpeek/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/kyroskoh/domainpeek/discussions)

---

Made with ❤️ by [Kyros Koh](https://github.com/kyroskoh)