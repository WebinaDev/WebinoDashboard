# webina-dashboard-sdk

```bash
cd WebinoDashboard/sdk/python && pip install -e .
```

```python
from webina_dashboard import DashboardClient

client = DashboardClient("https://store.example.com", token="...")
print(client.gate())
```
