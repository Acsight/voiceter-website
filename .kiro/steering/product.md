---
inclusion: always
---

# Voiceter Backend Integration - Product Guidelines

## Product Vision

The Voiceter Backend Integration system enables real-time voice survey demos that showcase the power of AI-driven CATI (Computer-Assisted Telephone Interviewing) capabilities. The system bridges a React frontend with Google Gemini Live API to deliver natural, conversational voice surveys with native audio understanding and generation.

## Core Product Goals

1. **Demonstrate AI Voice Survey Capabilities**: Showcase how AI can conduct professional surveys across different use cases (CSAT/NPS, concept testing, political polling, brand tracking)

2. **Generate Waitlist Leads**: Capture interest from potential customers by providing compelling demo experiences

3. **Prove Technical Feasibility**: Demonstrate that AI can handle complex survey logic, sentiment detection, quota management, and natural conversations

4. **Maintain Low Latency**: Ensure sub-300ms end-to-end latency for natural conversation flow

5. **Support Scale**: Handle 50+ concurrent demo sessions reliably

6. **High-Quality Voice Synthesis**: Leverage Gemini Live's native audio generation for natural, expressive AI voices

## Demo Questionnaires

### Demo 1: Customer Experience CSAT/NPS
**Purpose**: Demonstrate post-interaction satisfaction measurement
**Key Features**:
- CSAT rating scales (5-point)
- NPS scoring (0-10 scale)
- Conditional open-ended follow-ups with dynamic question text
- Sentiment detection on open-ended responses
- Empathetic AI responses based on scores

**Target Audience**: CX teams, support organizations, SaaS companies

### Demo 2: Concept Test Snapshot
**Purpose**: Test new product concepts with spontaneous reactions
**Key Features**:
- Spontaneous reaction capture (unfiltered first impressions)
- Purchase intent measurement
- Feature prioritization
- Objection identification without defending the product
- Innovation ideas from respondents

**Target Audience**: Product teams, innovation labs, CPG brands

### Demo 3: Political & Opinion Polling
**Purpose**: Conduct professional political opinion polls
**Key Features**:
- Age screening with quota tracking
- Voter registration screening
- Political affiliation with quota management
- Complete neutrality on sensitive topics
- Compliance with polling standards (anonymity, independence)
- Polite termination when quotas filled

**Target Audience**: Political consultants, pollsters, advocacy groups

### Demo 4: Brand Tracker Pulse
**Purpose**: Track brand awareness and preference
**Key Features**:
- Unaided brand awareness (open-ended, no prompting)
- Aided brand awareness (multiple choice)
- Purchase consideration funnel (dynamic options based on awareness)
- Brand preference measurement
- NPS for specific brand
- Brand perception capture (open-ended associations)
- Dynamic skip logic

**Target Audience**: Brand managers, market researchers, agencies

## User Experience Guidelines

### Voice Selection
- **Default Voice**: Use Gemini Charon voice for English demos unless user selects otherwise
- **Voice Mapping**: Existing voice preferences are mapped to Gemini equivalents:
  - matthew → Charon (male, informative)
  - tiffany → Aoede (female, warm)
  - amy → Kore (female, firm)
- **Available Voices**: Aoede, Charon, Fenrir, Kore, Puck, Orbit
- **Voice Personality**: Voices should match the survey context:
  - CSAT/NPS: Warm and empathetic (Aoede, Kore)
  - Concept Test: Enthusiastic and curious (Charon, Puck)
  - Political Polling: Neutral and professional (Charon)
  - Brand Tracker: Friendly and conversational (Aoede, Orbit)

### Conversation Flow
- **Natural Pacing**: AI should speak at a moderate pace with appropriate pauses
- **Active Listening**: Use phrases like "I understand", "Thank you for sharing that"
- **Empathy**: Respond appropriately to user sentiment (e.g., "I'm sorry to hear that" for negative feedback)
- **Neutrality**: Maintain complete neutrality in political polling - no inflection or emphasis on any party
- **Spontaneity**: Capture unfiltered reactions in concept testing - don't lead or prompt
- **Barge-In Support**: Allow users to interrupt AI speech naturally

### Error Handling
- **User-Friendly Messages**: Never expose technical details to users
- **Graceful Degradation**: Continue session if possible, even with errors
- **Clear Instructions**: Provide clear guidance when user action is needed (e.g., microphone permission)
- **Automatic Reconnection**: Attempt to reconnect on connection loss with exponential backoff

### Session Completion
- **Positive Closing**: Always end on a warm, positive note
- **Thank Users**: Express genuine appreciation for their time and feedback
- **Completion Summary**: Show users what they accomplished (questions answered, duration)

## Success Metrics

### Technical Metrics
- **Latency**: End-to-end latency < 300ms (P95)
- **Availability**: 99.9% uptime
- **Completion Rate**: > 60% of started sessions completed
- **Error Rate**: < 1% of sessions with errors
- **Concurrent Sessions**: Support 50+ simultaneous sessions
- **Gemini Live Connection Success**: > 99% successful connections

### Business Metrics
- **Demo Engagement**: Average session duration 4-5 minutes
- **Lead Conversion**: % of demo completions leading to waitlist signups
- **Demo Preferences**: Which demos are most popular
- **Voice Preferences**: Most selected AI voices
- **Geographic Distribution**: Where users are accessing from

### Quality Metrics
- **Audio Quality**: No reported audio issues
- **Transcription Accuracy**: ASR correctly capturing responses
- **Response Validation**: < 5% invalid responses
- **Natural Conversation**: User satisfaction scores
- **Voice Quality**: High-quality, natural-sounding AI voices

## Feature Priorities

### Must Have (MVP)
1. All 4 demo questionnaires working
2. Real-time audio streaming with low latency
3. Question progression with basic logic
4. Response recording to database
5. Session management and cleanup
6. Error handling and recovery
7. Voice selection with Gemini voices
8. Barge-in support

### Should Have (Phase 2)
1. Sentiment detection on open-ended responses
2. Quota management for political polling
3. Dynamic question text (NPS follow-ups)
4. Dynamic options filtering (brand tracker)
5. Audio recording to S3
6. CloudWatch monitoring and alarms
7. Session resumption for connection recovery

### Nice to Have (Future)
1. Multi-language support (leveraging Gemini's language capabilities)
2. Real-time analytics dashboard
3. Custom questionnaire builder
4. A/B testing capabilities
5. Advanced audio processing (noise cancellation)
6. Integration APIs for external systems
7. Video input support for visual surveys

## Quality Standards

### Code Quality
- TypeScript with strict mode
- 80%+ code coverage
- ESLint and Prettier for consistency
- Comprehensive error handling
- Structured logging

### Performance
- Sub-300ms latency for audio streaming
- Sub-100ms database writes
- Sub-500ms tool execution (5s timeout)
- Efficient memory usage (no leaks)

### Security
- WSS (WebSocket Secure) for all connections
- TLS 1.2+ for AWS and GCP APIs
- Input validation on all messages
- No sensitive data in logs
- IAM least privilege principle
- Secure Google Cloud credentials storage

### Reliability
- Graceful error handling
- Session state preservation on disconnect
- Automatic reconnection with exponential backoff
- Graceful shutdown on deployment
- Health check endpoint

## Development Principles

1. **User First**: Always prioritize user experience over technical elegance
2. **Fail Gracefully**: Never crash - always handle errors and continue if possible
3. **Log Everything**: Comprehensive logging for debugging and monitoring
4. **Test Thoroughly**: Unit tests, property tests, integration tests
5. **Document Clearly**: Code comments, API docs, integration guides
6. **Optimize Later**: Get it working first, then optimize for performance
7. **Security Always**: Never compromise on security, even for demos
8. **Monitor Actively**: Metrics, logs, alarms for proactive issue detection
