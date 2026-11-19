# AI-Runtime - (AIR)

=====================================

## Overview

a light ai-runtime written in typescript.

![Demo](demo.gif)

## Installation

```bash
git clone git@github.com:lvcca/ai-runtime.git;

cd ai-runtime;

docker compose down;
docker compose up --build --force-recreate;
```

## Client Usage

#### javascript
```typescript
fetch("http://localhost:8080/exec/newExec", {
  method: "GET",
  headers: { 
    "Content-Type": "application/json", 
    "task": "Using only the FileSystemApi tools or system commands list the files in the current directory .", 
    "id": crypto.randomUUID()
  }
}).then(res => res.text()).then(console.log).catch(console.error)
```

#### shell
```shell
curl -X GET "http://localhost:8080/exec/newExec" \
  -H "Content-Type: application/json" \
  -H "task: Using only the FileSystemApi tools or system commands list the files in the current directory ." \
  -H "id: 550e8400-e29b-41d4-a716-446655440000" 
```

#### powershell
```powershell
$url = "http://localhost:8080/exec/newExec"
$headers = @{
    "Content-Type" = "application/json"
    "task" = "Using only the FileSystemApi tools or system commands list the files in the current directory ."
    "id" = (New-Guid).Guid.ToString()
}
$response = Invoke-WebRequest -Method Get -Uri $url -Headers $headers
$output = $response.Content | ConvertFrom-Json
Write-Output $output
```

### Output

```shell
  {<LLM_RESULT>}
```

## Contributing

We welcome contributions from developers and users. If you'd like to contribute to the ai-runtime project, please submit a pull request with your changes.

## Philosophy

AI-Runtime is responsible for turning objectives into completed outcomes, using AI reasoning and available execution capabilities.
Every major feature should support that objective.

## License

ai-runtime is released under the [MIT License](https://opensource.org/licenses/MIT).

## Issues

If you encounter any issues or have questions about using ai-runtime, please submit an issue on our GitHub repository.

### Open Task
 * ShellJob Workflow
 * Runtime Tool Loading / dynamic tool chain
 * forever tech debt 