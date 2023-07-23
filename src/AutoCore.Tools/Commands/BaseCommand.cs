namespace AutoCore.Tools.Commands;

public abstract class BaseCommand
{
    public string[] Arguments { get; }

    public BaseCommand(string[] arguments)
    {
        Arguments = arguments;
    }

    public abstract bool Execute();
}
