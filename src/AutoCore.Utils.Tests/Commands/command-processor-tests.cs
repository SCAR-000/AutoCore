using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AutoCore.Utils.Test.Commands;

using AutoCore.Utils.Commands;

[TestClass]
public class CommandProcessorTests
{
    [TestInitialize]
    public void ResetCommandProcessor()
    {
        var commandsField = typeof(CommandProcessor).GetField("Commands", BindingFlags.NonPublic | BindingFlags.Static);
        var commands = (Dictionary<string, Action<string[]>>)commandsField!.GetValue(null)!;
        commands.Clear();

        var trimScopeField = typeof(CommandProcessor).GetField("TrimScope", BindingFlags.NonPublic | BindingFlags.Static);
        trimScopeField!.SetValue(null, true);
    }

    [TestMethod]
    public void RegisterCommand_withTrimScope_stripsPrefixAndCollidesOnDuplicateSuffix()
    {
        CommandProcessor.RegisterCommand("auth.exit", _ => { });

        Assert.ThrowsException<ArgumentException>(() =>
            CommandProcessor.RegisterCommand("global.exit", _ => { }));
    }

    [TestMethod]
    public void UseScopes_keepsPrefixedNamesForMultipleServers()
    {
        CommandProcessor.UseScopes();

        CommandProcessor.RegisterCommand("auth.exit", _ => { });
        CommandProcessor.RegisterCommand("global.exit", _ => { });
        CommandProcessor.RegisterCommand("sector.exit", _ => { });

        var commandsField = typeof(CommandProcessor).GetField("Commands", BindingFlags.NonPublic | BindingFlags.Static);
        var commands = (Dictionary<string, Action<string[]>>)commandsField!.GetValue(null)!;

        CollectionAssert.AreEquivalent(
            new[] { "auth.exit", "global.exit", "sector.exit" },
            commands.Keys.ToArray());
    }

    [TestMethod]
    public void RemoveCommand_withUseScopes_removesPrefixedName()
    {
        var called = false;

        CommandProcessor.UseScopes();
        CommandProcessor.RegisterCommand("auth.create", _ => called = true);
        CommandProcessor.RemoveCommand("auth.create");
        CommandProcessor.RegisterCommand("auth.create", _ => called = true);

        Assert.IsTrue(called == false);
    }
}
