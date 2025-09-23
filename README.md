# DomainPeek

A production-grade web application that provides comprehensive domain analysis including WHOIS/RDAP registration data, DNS records analysis, security scoring, and interactive visualizations. Built with modern web technologies and designed to be a powerful alternative to services like who.is.

## 🚀 Features

### Core Analysis Engine
- **WHOIS & RDAP Lookup**: Real-time domain registration information with fallback mechanisms
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
│   ├── frontend/          # Next.js 15 with React 19
│   └── backend/           # Express.js with TypeScript
├── docker-compose.yml     # Local development orchestration
├── nginx.conf            # Nginx reverse proxy configuration
└── deploy.sh             # Automated deployment script
```

### Tech Stack

**Frontend**
- Next.js 15 with App Router
- React 19 with TypeScript
- TailwindCSS 4 for styling
- D3.js for interactive data visualizations
- Theme-aware chart system with automatic light/dark mode switching
- Three.js for animations
- React Query for data fetching
- Framer Motion for UI animations
- next-themes for seamless theme management

**Backend**
- Express.js with TypeScript
- Redis for caching and session management
- Node.js DNS libraries and WHOIS clients
- OpenAPI/Swagger documentation
- Jest for testing
- Docker containerization

## 🚦 Getting Started

### Prerequisites

- Node.js >= 18.0.0
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
## 🧪 Testing

### Automated Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test suites
npm run test:frontend
npm run test:backend
```

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
```
aps/frontend/src/
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
├── controllers/           # Request handlers
├── services/              # Business logic
│   ├── whois/            # WHOIS lookup services
│   ├── rdap/             # RDAP client services
│   ├── dns/              # DNS resolution services
│   └── analysis/         # Security analysis engine
├── middleware/            # Express middleware
├── routes/                # API route definitions
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
WHOIS_TIMEOUT_MS=5000
DNS_TIMEOUT_MS=5000
```

**Frontend (`apps/frontend/.env.local`)**
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001
NEXT_PUBLIC_APP_ENV=development
```

## 🚀 Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production servers
npm run start
```

### Docker Production

```bash
# Build production images
docker-compose build

# Deploy to production
docker-compose up -d

# Or use the automated deployment script
./deploy.sh --environment production

# With optional services (Redis, Nginx)
./deploy.sh --profile redis,nginx
```

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
- [x] WHOIS/RDAP lookup engine
- [x] DNS analysis engine
- [x] Complete web interface integration
- [x] Domain topology network visualizations
- [x] Security threat analysis and scoring

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

## 🙏 Acknowledgments

- Built with inspiration from [who.is](https://who.is)
- Uses open-source DNS and WHOIS data sources
- Leverages IANA registries for RDAP endpoints
- Community feedback and contributions

## 📞 Support

- 📧 Email: support@domainpeek.com
- 🐛 Issues: [GitHub Issues](https://github.com/kyroskoh/domainpeek/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/kyroskoh/domainpeek/discussions)

---

Made with ❤️ by [Kyros Koh](https://github.com/kyroskoh)