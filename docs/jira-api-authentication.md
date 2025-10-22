# Jira API Authentication Verification

## API Token Usage in Jira Cloud

### How Jira API Authentication Works

Jira Cloud uses **Basic Authentication** with API tokens:

```
Authorization: Basic base64(email:api_token)
```

### Using jira-client Package

The `jira-client` npm package configuration:

```javascript
const JiraClient = require('jira-client');

const jira = new JiraClient({
  protocol: 'https',
  host: 'your-domain.atlassian.net',
  username: 'user@company.com',      // Your email
  password: 'ATATxxxxxxxxxxxxx',     // API Token (NOT your password!)
  apiVersion: '2',
  strictSSL: true
});
```

**IMPORTANT**: The `password` field accepts the API token, NOT your Jira account password.

### Verification: Our Code is Correct ✅

In `src/integrations/jira-example.ts`, we use:

```typescript
const jiraCreds = assigneeCredentials?.jira;
const email = jiraCreds?.email;
const apiToken = jiraCreds?.apiToken;

// This is the correct way:
return new JiraClient({
  protocol: 'https',
  host: host,
  username: email,        // Agent's email
  password: apiToken,     // Agent's API token
  apiVersion: '2',
  strictSSL: true
});
```

### Creating Issues with API Token

```javascript
// This will work with API token authentication
const issue = await jira.addNewIssue({
  fields: {
    project: { key: 'PROJ' },
    summary: 'Task description',
    issuetype: { name: 'Task' },
    assignee: { accountId: '557058:abc123' }
  }
});
// Returns: { key: 'PROJ-123', id: '10001', ... }
```

### Updating Issues with API Token

```javascript
// Transition issue (e.g., move to "In Progress")
await jira.transitionIssue('PROJ-123', {
  transition: { id: '21' }  // or { name: 'In Progress' }
});

// Add comment
await jira.addComment('PROJ-123', 'Task completed successfully');
```

### Testing Authentication

To verify your API token works:

```bash
curl -u "user@company.com:ATATxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  https://your-domain.atlassian.net/rest/api/2/myself
```

Should return your account details if authentication is successful.

### Common Issues

#### Issue: "401 Unauthorized"
**Cause**: Invalid API token or email
**Solution**:
- Verify email matches your Atlassian account
- Regenerate API token at https://id.atlassian.com/manage-profile/security/api-tokens
- Ensure token hasn't been revoked

#### Issue: "403 Forbidden"
**Cause**: Valid auth but no permissions
**Solution**: Check project permissions for the user

#### Issue: "404 Not Found"
**Cause**: Project doesn't exist or user has no access
**Solution**: Verify project key and user has access to the project

## Conclusion

✅ **Our `apiToken` field is CORRECT and FULLY SUPPORTED**

The jira-client package's `password` field is designed to accept API tokens.
This is the standard and recommended way to authenticate with Jira Cloud API.
