# Claude Code for Work Teams: Product Briefing

## Executive Summary

Claude Code is Anthropic's AI-powered coding assistant that integrates directly into developers' terminals and workflows. Premium seats give users access to both Claude and Claude Code, enabling them to partner with Claude throughout the entire development lifecycle. "Claude Code and Claude have accelerated Altana's development velocity by 2-10x" according to Peter Swartz, Co-founder and Chief Science Officer at Altana.

This briefing covers the Team and Enterprise plans, which bundle Claude Code with comprehensive administrative controls, security features, and data governance capabilities required for professional deployment.

## Pricing Structure

### Team Plan
Based on your screenshot and current information:
- **Standard Seat**: $25/month per person (annual billing) or $30/month (monthly billing)
  - Minimum 5 members required
  - Includes chat, projects, and collaborative features
  - Does NOT include Claude Code

- **Premium Seat**: $150/month per person
  - Minimum 5 members required
  - Includes Claude Code access
  - Significantly higher usage limits
  - Full integration between Claude chat and Claude Code

### Enterprise Plan
- Custom pricing (contact sales)
- According to some users, it is set at $60 per seat for a minimum of 70 users and a 12-month contract. This means that the Enterprise plan's minimal price is around $50,000
- Includes all Team features plus advanced security and compliance capabilities

### Additional Costs
Admins have control over the maximum amount a user can spend with extra usage to ensure that users get flexibility and admins get predictable billing when usage exceeds included limits. Extra usage is billed at standard API rates.

## Key Features

### Core Claude Code Capabilities
- Terminal-based AI coding assistant
- Code generation, debugging, and refactoring
- Git workflow automation
- Project-wide code understanding
- Natural language to code translation
- Multi-file editing and context awareness

### Team Plan Features
Both Team and Enterprise plans include granular spend caps, self-serve seat management, and Claude Code usage analytics

Additional Team benefits from your screenshot:
- More usage compared to individual plans
- Admin controls for remote and local connectors
- Single sign-on (SSO) and domain capture
- Enterprise deployment for the Claude desktop app
- Enterprise search across your organization
- Connect Microsoft 365, Slack, and more integrations
- Central billing and administration
- Early access to collaboration features

### Enterprise Plan Additional Features
Enterprise-grade security features to ensure the safety and compliance of your organization's data including single-sign on (SSO) and domain capture, audit logs, System for Cross-domain Identity Management (SCIM), custom data retention controls and role-based permissioning for fine-grained user management

- Expanded context window that enables users to upload hundreds of sales transcripts, dozens of 100+ page documents and 100K lines of code
- Native integrations with data sources like GitHub provide the ability for engineering teams to brainstorm alongside your codebase, iterate on new features, onboard engineers and debug issues
- Compliance API for programmatic access to usage data
- Dedicated account manager

## Licensing Model

### Seat-Based Licensing
- Flexible seat assignment: Admins have full flexibility to assign standard or premium seats according to individual user requirements and organizational roles
- Mix and match standard and premium seats within the same organization
- Self-serve seat management through admin dashboard

### Usage Limits
- Each seat includes base usage allocation
- Claude seats include enough usage for a typical workday, but for times when your teams need access to more intelligence and additional conversations with Claude–admins can enable extra usage for individual users at standard API rates

## Data Governance & Privacy

### Data Protection Commitments

**For Team and Enterprise Plans:**
- By default, we will not use your inputs or outputs to train our models
- Inputs and outputs will NOT be used to train models except for conversations flagged for Trust & Safety review, explicitly reported materials, or user opt-in
- 30-day retention for most data (customizable for Enterprise)

### Security Controls

**Identity & Access Management:**
- Claude Enterprise supports SAML 2.0 and OIDC-based SSO, enabling organizations to centralize authentication and enforce stronger identity governance
- Domain capture for automated workspace enrollment
- Role-based access controls (RBAC)

**Compliance & Auditing:**
- We are also introducing a new Compliance API, giving organizations programmatic access to usage data and customer content for better observability, auditing, and governance
- Audit logs for all activities
- SOC 2 Type II compliance

**Data Residency Options:**
- Private network deployments through AWS Bedrock and Google Vertex AI ensure zero data egress for regulated workloads
- Zero Data Retention (ZDR) options available for Enterprise

### Administrative Controls

Managed policy settings: Deploy and enforce settings across all Claude Code users to match internal policies, including tool permissions, file access restrictions, and MCP server configurations

## Limitations & Considerations

### Technical Limitations
- Code context is sent to Anthropic's servers for processing (not stored locally)
- Usage limits apply even with premium seats (though significantly higher)
- Real-time collaboration features still in development

### Security Considerations
Prompt Injection Attacks: Malicious instructions hidden in input text can override Claude's intended behavior and lead to harmful actions, including exfiltrating sensitive data

Recommended restrictions:
- Production secrets or API keys should never be included in code that Claude analyzes
- Proprietary algorithms with significant business value represent core competitive advantages that require careful protection
- Customer data or personal information should remain out of Claude Code interactions to maintain privacy compliance

### Compliance Considerations
- Different industries have varying requirements for AI-assisted development and data handling. Consider how Claude Code usage fits with your industry's specific regulations, especially in heavily regulated sectors like finance, healthcare, or government contracting
- Ensure compatibility with existing NDAs and client confidentiality agreements

## Implementation Recommendations

### Getting Started
1. Determine seat allocation (standard vs. premium) based on team roles
2. Configure SSO and domain capture for seamless onboarding
3. Establish usage policies and guidelines
4. Set up spending caps and monitoring
5. Configure integrations (GitHub, Microsoft 365, Slack)

### Best Practices for Secure Deployment
1. **Policy Development**: Create clear guidelines on acceptable use cases
2. **Access Controls**: Use role-based permissions to limit sensitive access
3. **Monitoring**: Leverage the Compliance API for continuous oversight
4. **Training**: Ensure developers understand data transmission implications
5. **Sandboxing**: Consider isolated environments for highly sensitive projects

### Governance Framework
- Establish an AI governance committee
- Define data classification standards
- Create incident response procedures
- Regular security audits of Claude Code usage
- Document compliance with industry regulations

## ROI & Benefits

### Productivity Gains
- "Claude Code and Claude have accelerated Altana's development velocity by 2-10x"
- Reduced time on routine coding tasks
- Faster onboarding of new developers
- Improved code quality through AI-assisted reviews

### Cost Optimization
- Centralized billing reduces procurement overhead
- Flexible seat assignment optimizes license utilization
- Extra usage model prevents overpaying for occasional peak needs

## Support & Resources

### Official Documentation
- API Documentation: https://docs.claude.com
- Support Center: https://support.claude.com
- Enterprise Sales: https://www.anthropic.com/contact-sales

### Training & Onboarding
- Dedicated account manager for Enterprise plans
- Self-serve resources for Team plans
- Early access to new features for continuous improvement

## Summary & Next Steps

Claude Code bundled with Team and Enterprise plans offers a comprehensive solution for organizations looking to leverage AI in their development workflows while maintaining security and compliance standards. The flexible pricing model, robust administrative controls, and strong data governance features make it suitable for professional deployment.

### Recommended Actions:
1. **Evaluate current development workflows** to identify high-impact use cases
2. **Calculate ROI** based on expected productivity gains (2-10x reported by users)
3. **Review compliance requirements** specific to your industry
4. **Start with a pilot** using Team plan with select developers
5. **Contact sales** for Enterprise pricing if you have 70+ potential users

### Key Decision Factors:
- Minimum 5 users for Team plan
- $150/month per premium seat for Claude Code access
- Strong data protection (no model training on your data)
- Comprehensive admin controls and compliance features
- Proven productivity gains in real enterprise deployments

---

*This briefing is based on information current as of November 2025. For the most up-to-date information and custom pricing, contact Anthropic's sales team.*